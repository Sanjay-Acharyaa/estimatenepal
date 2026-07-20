import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { invalidateRatesCache } from "@/lib/rates";

const RATE_ID_RE = /^[a-zA-Z0-9_-]+$/;

const updateSchema = z.object({
  code: z.string().min(1).max(50).trim().optional(),
  description: z.string().min(1).trim().optional(),
  unit: z.string().min(1).max(50).trim().optional(),
  baseRate: z.number().min(0).max(9_999_999).optional(),
  fiscalYear: z.string().min(4).max(10).trim().optional(),
});

async function getRateAndGuard(rateId: string, token: Record<string, unknown>) {
  const rate = await prisma.rateItem.findUnique({ where: { id: rateId } });
  if (!rate) throw notFound("Rate item");
  // DUDBC rates (orgId=null) are read-only for non-super-admins
  if (rate.source !== "CUSTOM" && !token.isSuperAdmin) throw forbidden();
  // CUSTOM rates: must belong to user's org; withTenantGuard returns the member so role is checked once
  let member: { role: string } | null = null;
  if (rate.source === "CUSTOM" && rate.orgId) {
    member = await withTenantGuard(token.id as string, rate.orgId);
  }
  return { rate, member };
}

export async function GET(req: NextRequest, { params }: { params: { rateId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    if (!RATE_ID_RE.test(params.rateId) || params.rateId.length > 128) return apiError("VALIDATION_ERROR", "Invalid rate ID.", 400);

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

    if (!RATE_ID_RE.test(params.rateId) || params.rateId.length > 128) return apiError("VALIDATION_ERROR", "Invalid rate ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const { rate, member } = await getRateAndGuard(params.rateId, token);

    // Only OWNER/ADMIN can edit — member already fetched by getRateAndGuard
    if (!member || (!["OWNER", "ADMIN"].includes(member.role) && !token.isSuperAdmin)) throw forbidden();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.rateItem.update({
      where: { id: params.rateId },
      data: parsed.data,
    });

    appendAuditLog({
      orgId: rate.orgId ?? "system",
      userId: token.id as string,
      event: "rate_item.updated",
      resourceId: rate.id,
      meta: parsed.data as import("@prisma/client").Prisma.InputJsonValue,
      ipAddress: ip,
    });

    invalidateRatesCache(rate.orgId ?? undefined).catch(() => {});

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

    if (!RATE_ID_RE.test(params.rateId) || params.rateId.length > 128) return apiError("VALIDATION_ERROR", "Invalid rate ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const { rate, member } = await getRateAndGuard(params.rateId, token);
    if (!member || (!["OWNER", "ADMIN"].includes(member.role) && !token.isSuperAdmin)) throw forbidden();

    await prisma.rateItem.delete({ where: { id: params.rateId } });

    appendAuditLog({
      orgId: rate.orgId ?? "system",
      userId: token.id as string,
      event: "rate_item.deleted",
      resourceId: rate.id,
      meta: { code: rate.code },
      ipAddress: ip,
    });

    invalidateRatesCache(rate.orgId ?? undefined).catch(() => {});

    return NextResponse.json({ message: "Rate item deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
