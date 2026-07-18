import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden, notFound, conflict } from "@/lib/errors";
import { ResourceCategory } from "@prisma/client";

const VALID_CATEGORIES = Object.values(ResourceCategory);

const updateSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  category: z.enum(VALID_CATEGORIES as [ResourceCategory, ...ResourceCategory[]]).optional(),
  unit: z.string().min(1).max(50).trim().optional(),
  unitRate: z.number().min(0).optional(),
  wastagePercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).trim().nullable().optional(),
});

function invalidateCache(orgId: string, ...categories: (string | undefined)[]) {
  redis.del(`resources:${orgId}:all`).catch(() => {});
  for (const cat of categories) {
    if (cat) redis.del(`resources:${orgId}:${cat}`).catch(() => {});
  }
}

type RouteContext = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const orgId = token.orgId as string;
    const user = await withTenantGuard(token.id as string, orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const existing = await prisma.orgResource.findFirst({
      where: { id: params.id, orgId },
    });
    if (!existing) throw notFound("Resource");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const data = parsed.data;
    const priceChanged = data.unitRate !== undefined && data.unitRate !== existing.unitRate;

    const resource = await prisma.orgResource.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.unitRate !== undefined ? { unitRate: data.unitRate } : {}),
        ...(data.wastagePercent !== undefined ? { wastagePercent: data.wastagePercent } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(priceChanged ? { priceUpdatedAt: new Date() } : {}),
      },
    });

    invalidateCache(orgId, existing.category, data.category);

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "resource.update",
      resourceId: resource.id,
      meta: { name: resource.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ resource });
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

    const orgId = token.orgId as string;
    const user = await withTenantGuard(token.id as string, orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const existing = await prisma.orgResource.findFirst({
      where: { id: params.id, orgId },
    });
    if (!existing) throw notFound("Resource");

    const lineCount = await prisma.rateAnalysisLine.count({
      where: { resourceId: params.id },
    });
    if (lineCount > 0) {
      throw conflict(
        `Cannot delete: this resource is used in ${lineCount} rate analysis line(s). Remove those lines first.`
      );
    }

    await prisma.orgResource.delete({ where: { id: params.id } });

    invalidateCache(orgId, existing.category);

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "resource.delete",
      resourceId: params.id,
      meta: { name: existing.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
