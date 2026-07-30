import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { RATE_DEFAULTS } from "@/lib/rate-defaults";
import { CACHE_TTL, DRY_VOLUME_MAX } from "@/lib/cache-constants";

const updateSchema = z.object({
  overheadPct: z.number().min(0).max(100).optional(),
  profitPct: z.number().min(0).max(100).optional(),
  contingencyPct: z.number().min(0).max(100).optional(),
  vatPct: z.number().min(0).max(100).optional(),
  leadLiftPct: z.number().min(0).max(100).optional(),
  dryVolumeMortar: z.number().min(1).max(DRY_VOLUME_MAX).optional(),
  dryVolumeConcrete: z.number().min(1).max(DRY_VOLUME_MAX).optional(),
});

function ck(orgId: string) {
  return `rate-settings:${orgId}`;
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const orgId = token.orgId as string;
    const hit = await redis.get(ck(orgId)).catch(() => null);
    if (hit) return NextResponse.json(JSON.parse(hit as string));

    const settings = await prisma.orgRateSettings.findUnique({ where: { orgId } });

    const payload = {
      settings: settings ?? { orgId, ...RATE_DEFAULTS },
    };

    redis.set(ck(orgId), JSON.stringify(payload), "EX", CACHE_TTL).catch(() => {});
    return NextResponse.json(payload);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const data = parsed.data;
    if (Object.keys(data).length === 0) return apiError("VALIDATION_ERROR", "No fields provided.", 400);

    const settings = await prisma.orgRateSettings.upsert({
      where: { orgId },
      create: { orgId, ...RATE_DEFAULTS, ...data },
      update: data,
    });

    redis.del(ck(orgId)).catch(() => {});

    appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "rate_settings.update",
      resourceId: orgId,
      meta: { fields: Object.keys(data) } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}
