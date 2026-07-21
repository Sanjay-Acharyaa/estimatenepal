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
import { UNIT_RATE_MAX } from "@/lib/cache-constants";
import { RESOURCE_UNITS } from "@/lib/resource-constants";

const RESOURCE_ID_RE = /^[a-zA-Z0-9_-]+$/;

const VALID_CATEGORIES = Object.values(ResourceCategory);

const updateSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  category: z.enum(VALID_CATEGORIES as [ResourceCategory, ...ResourceCategory[]]).optional(),
  unit: z.string().min(1).max(50).trim().optional(),
  unitRate: z.number().min(0).max(UNIT_RATE_MAX).optional(),
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

    if (!RESOURCE_ID_RE.test(params.id) || params.id.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid resource ID.", 400);

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

    // Validate unit against RESOURCE_UNITS using the effective category after this update
    if (data.unit !== undefined) {
      const effectiveCategory = (data.category ?? existing.category) as string;
      const allowed = RESOURCE_UNITS[effectiveCategory];
      if (allowed && !allowed.includes(data.unit)) {
        return apiError("VALIDATION_ERROR", `Unit "${data.unit}" is not valid for this category. Allowed: ${allowed.join(", ")}`, 400);
      }
    }

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

    // When unit rate changes, analysis-lines caches that embed this resource's price must be
    // cleared so Rate Analysis immediately shows the new price and "Apply to Base Rate" pushes
    // the correct pre-VAT rate.
    if (priceChanged) {
      const affectedLines = await prisma.rateAnalysisLine.findMany({
        where: { resourceId: params.id, orgId },
        select: { rateItemId: true },
      });
      const affectedIds = Array.from(new Set(affectedLines.map((l) => l.rateItemId)));
      for (const rateItemId of affectedIds) {
        redis.del(`analysis-lines:${orgId}:${rateItemId}`).catch(() => {});
      }
    }

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "resource.update",
      resourceId: resource.id,
      meta: { name: resource.name },
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

    if (!RESOURCE_ID_RE.test(params.id) || params.id.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid resource ID.", 400);

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

    // Transaction prevents TOCTOU race between the usage check and the delete.
    await prisma.$transaction(async (tx) => {
      const lineCount = await tx.rateAnalysisLine.count({
        where: { resourceId: params.id, orgId },
      });
      if (lineCount > 0) {
        throw conflict(
          `Cannot delete: this resource is used in ${lineCount} rate analysis line(s). Remove those lines first.`
        );
      }
      await tx.orgResource.delete({ where: { id: params.id } });
    });

    invalidateCache(orgId, existing.category);

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "resource.delete",
      resourceId: params.id,
      meta: { name: existing.name },
      ipAddress: ip,
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
