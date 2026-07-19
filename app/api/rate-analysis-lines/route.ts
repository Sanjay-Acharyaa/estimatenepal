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
import { CACHE_TTL, QTY_PER_UNIT_MAX } from "@/lib/cache-constants";

const LINE_ID_RE = /^[a-zA-Z0-9_-]+$/;

const createSchema = z.object({
  rateItemId: z.string().min(1),
  resourceId: z.string().min(1),
  lineType: z.enum(LINE_TYPES).default("MATERIAL"),
  qtyPerUnit: z.number().min(0).max(QTY_PER_UNIT_MAX),
  wastagePercent: z.number().min(0).max(100).default(0),
  notes: z.string().max(500).trim().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

function ck(orgId: string, rateItemId: string) {
  return `analysis-lines:${orgId}:${rateItemId}`;
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
    const rateItemId = req.nextUrl.searchParams.get("rateItemId") ?? "";
    if (!rateItemId) return apiError("VALIDATION_ERROR", "rateItemId query param is required.", 400);
    if (!LINE_ID_RE.test(rateItemId) || rateItemId.length > 128) return apiError("VALIDATION_ERROR", "Invalid rateItemId.", 400);

    const key = ck(orgId, rateItemId);
    const hit = await redis.get(key).catch(() => null);
    if (hit) return NextResponse.json(JSON.parse(hit as string));

    // Rate item must belong to this org or be a global DUDBC item
    const rateItem = await prisma.rateItem.findFirst({
      where: { id: rateItemId, OR: [{ orgId }, { orgId: null }] },
      select: { id: true },
    });
    if (!rateItem) throw notFound("Rate item");

    const lines = await prisma.rateAnalysisLine.findMany({
      where: { orgId, rateItemId },
      include: {
        resource: {
          select: { id: true, name: true, category: true, unit: true, unitRate: true, wastagePercent: true },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const payload = { lines };
    redis.set(key, JSON.stringify(payload), "EX", CACHE_TTL).catch(() => {});
    return NextResponse.json(payload);
  } catch (err) {
    return handleApiError(err);
  }
}

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

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const data = parsed.data;

    const resource = await prisma.orgResource.findFirst({
      where: { id: data.resourceId, orgId },
    });
    if (!resource) throw notFound("Resource");

    const rateItem = await prisma.rateItem.findFirst({
      where: { id: data.rateItemId, OR: [{ orgId }, { orgId: null }] },
    });
    if (!rateItem) throw notFound("Rate item");

    const line = await prisma.rateAnalysisLine.create({
      data: {
        orgId,
        rateItemId: data.rateItemId,
        resourceId: data.resourceId,
        lineType: data.lineType,
        qtyPerUnit: data.qtyPerUnit,
        wastagePercent: data.wastagePercent,
        notes: data.notes ?? null,
        sortOrder: data.sortOrder,
      },
      include: {
        resource: {
          select: { id: true, name: true, category: true, unit: true, unitRate: true, wastagePercent: true },
        },
      },
    });

    redis.del(ck(orgId, data.rateItemId)).catch(() => {});

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "analysis_line.create",
      resourceId: line.id,
      meta: { rateItemId: data.rateItemId, resourceName: resource.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ line }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
