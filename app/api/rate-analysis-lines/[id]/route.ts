import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { LINE_TYPES } from "@/lib/line-types";
import { QTY_PER_UNIT_MAX } from "@/lib/cache-constants";

const LINE_ID_RE = /^[a-zA-Z0-9_-]+$/;

const updateSchema = z.object({
  lineType: z.enum(LINE_TYPES).optional(),
  qtyPerUnit: z.number().min(0).max(QTY_PER_UNIT_MAX).optional(),
  wastagePercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).trim().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

type RouteContext = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    if (!LINE_ID_RE.test(params.id) || params.id.length > 128) return apiError("VALIDATION_ERROR", "Invalid line ID.", 400);

    const orgId = token.orgId as string;
    const user = await withTenantGuard(token.id as string, orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const existing = await prisma.rateAnalysisLine.findFirst({
      where: { id: params.id, orgId },
    });
    if (!existing) throw notFound("Analysis line");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const data = parsed.data;
    if (Object.keys(data).length === 0) return apiError("VALIDATION_ERROR", "No fields provided.", 400);

    const line = await prisma.rateAnalysisLine.update({
      where: { id: params.id },
      data,
      include: {
        resource: {
          select: { id: true, name: true, category: true, unit: true, unitRate: true, wastagePercent: true },
        },
      },
    });

    redis.del(`analysis-lines:${orgId}:${existing.rateItemId}`).catch(() => {});

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "analysis_line.update",
      resourceId: params.id,
      meta: { rateItemId: existing.rateItemId } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ line });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    if (!LINE_ID_RE.test(params.id) || params.id.length > 128) return apiError("VALIDATION_ERROR", "Invalid line ID.", 400);

    const orgId = token.orgId as string;
    const user = await withTenantGuard(token.id as string, orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const existing = await prisma.rateAnalysisLine.findFirst({
      where: { id: params.id, orgId },
    });
    if (!existing) throw notFound("Analysis line");

    await prisma.rateAnalysisLine.delete({ where: { id: params.id } });

    redis.del(`analysis-lines:${orgId}:${existing.rateItemId}`).catch(() => {});

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "analysis_line.delete",
      resourceId: params.id,
      meta: { rateItemId: existing.rateItemId } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
