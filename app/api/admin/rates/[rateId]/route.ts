import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";

function requireSuperAdmin(token: { isSuperAdmin?: unknown } | null) {
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
}

const updateSchema = z.object({
  code: z.string().min(1).max(50).trim().optional(),
  description: z.string().min(1).trim().optional(),
  unit: z.string().min(1).max(50).trim().optional(),
  baseRate: z.number().min(0).optional(),
  fiscalYear: z.string().min(4).max(10).trim().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    requireSuperAdmin(token);
    const rate = await prisma.rateItem.findUnique({
      where: { id: params.rateId },
      include: { districtRates: true },
    });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");
    return NextResponse.json(rate);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    requireSuperAdmin(token);

    const rate = await prisma.rateItem.findUnique({ where: { id: params.rateId } });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");
    if (rate.isPublished) return apiError("FORBIDDEN", "Published rates cannot be edited.", 403);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.rateItem.update({
      where: { id: params.rateId },
      data: parsed.data,
    });

    await appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rate.updated",
      resourceId: params.rateId,
      meta: parsed.data as any,
      ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    requireSuperAdmin(token);

    const rate = await prisma.rateItem.findUnique({ where: { id: params.rateId } });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");
    if (rate.isPublished) return apiError("FORBIDDEN", "Published rates cannot be deleted.", 403);

    await prisma.rateItem.delete({ where: { id: params.rateId } });

    await appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rate.deleted",
      resourceId: params.rateId,
      meta: { code: rate.code, fiscalYear: rate.fiscalYear } as any,
      ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    return NextResponse.json({ message: "Deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
