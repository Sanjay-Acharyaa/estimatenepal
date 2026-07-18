import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { DEFAULT_RESOURCES } from "@/lib/resource-defaults";

// POST /api/resources/seed
// Seeds default Nepal resource library for the org.
// Safe to call multiple times — existing name+category pairs are skipped.
export async function POST(req: NextRequest) {
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

    const existing = await prisma.orgResource.findMany({
      where: { orgId },
      select: { name: true, category: true },
    });
    const existingSet = new Set(existing.map((r) => `${r.category}::${r.name}`));

    const toCreate = DEFAULT_RESOURCES.filter(
      (r) => !existingSet.has(`${r.category}::${r.name}`)
    );

    if (toCreate.length > 0) {
      await prisma.orgResource.createMany({
        data: toCreate.map((r) => ({
          orgId,
          name: r.name,
          category: r.category,
          unit: r.unit,
          unitRate: r.unitRate,
          wastagePercent: r.wastagePercent,
          notes: r.notes ?? null,
          isDefault: true,
          priceUpdatedAt: new Date(),
        })),
      });
    }

    // Invalidate all cache keys - "all" and each seeded category
    redis.del(`resources:${orgId}:all`).catch(() => {});
    const seededCategories = Array.from(new Set(toCreate.map((r) => r.category)));
    for (const cat of seededCategories) {
      redis.del(`resources:${orgId}:${cat}`).catch(() => {});
    }

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "resource.seed",
      resourceId: orgId,
      meta: { seeded: toCreate.length, skipped: existing.length } as any,
      ipAddress: ip,
    });

    return NextResponse.json({
      seeded: toCreate.length,
      skipped: existing.length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
