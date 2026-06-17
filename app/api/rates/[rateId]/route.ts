import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";

const updateSchema = z.object({
  code: z.string().min(1).max(50).trim().optional(),
  description: z.string().min(1).trim().optional(),
  unit: z.string().min(1).max(50).trim().optional(),
  baseRate: z.number().min(0).optional(),
  fiscalYear: z.string().min(4).max(10).trim().optional(),
});

async function getRateAndGuard(rateId: string, token: any) {
  const rate = await prisma.rateItem.findUnique({ where: { id: rateId } });
  if (!rate) throw notFound("Rate item");
  // DUDBC rates (orgId=null) are read-only for non-super-admins
  if (rate.source !== "CUSTOM" && !token.isSuperAdmin) throw forbidden();
  // CUSTOM rates: must belong to user's org
  if (rate.source === "CUSTOM" && rate.orgId) {
    await withTenantGuard(token.id as string, rate.orgId);
  }
  return rate;
}

export async function GET(req: NextRequest, { params }: { params: { rateId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const rate = await prisma.rateItem.findUnique({
      where: { id: params.rateId },
      include: { districtRates: true },
    });
    if (!rate) throw notFound("Rate item");

    // Org can read its own CUSTOM rates and global DUDBC rates
    if (rate.orgId && rate.orgId !== (token.orgId as string) && !token.isSuperAdmin) throw forbidden();

    return NextResponse.json(rate);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { rateId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const rate = await getRateAndGuard(params.rateId, token);

    // Only OWNER/ADMIN can edit
    const user = await prisma.user.findUnique({ where: { id: token.id as string } });
    if (!user || (!["OWNER", "ADMIN"].includes(user.role) && !user.isSuperAdmin)) throw forbidden();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.rateItem.update({
      where: { id: params.rateId },
      data: parsed.data,
    });

    await appendAuditLog({
      orgId: rate.orgId ?? "system",
      userId: token.id as string,
      event: "rate_item.updated",
      resourceId: rate.id,
      meta: parsed.data as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { rateId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const rate = await getRateAndGuard(params.rateId, token);
    const user = await prisma.user.findUnique({ where: { id: token.id as string } });
    if (!user || (!["OWNER", "ADMIN"].includes(user.role) && !user.isSuperAdmin)) throw forbidden();

    await prisma.rateItem.delete({ where: { id: params.rateId } });

    await appendAuditLog({
      orgId: rate.orgId ?? "system",
      userId: token.id as string,
      event: "rate_item.deleted",
      resourceId: rate.id,
      meta: { code: rate.code } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Rate item deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
