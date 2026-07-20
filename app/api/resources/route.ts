import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { ResourceCategory } from "@prisma/client";
import { CACHE_TTL, RESOURCES_FETCH_LIMIT, UNIT_RATE_MAX } from "@/lib/cache-constants";
import { RESOURCE_UNITS } from "@/lib/resource-constants";
const VALID_CATEGORIES = Object.values(ResourceCategory);

const createSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  category: z.enum(VALID_CATEGORIES as [ResourceCategory, ...ResourceCategory[]]),
  unit: z.string().min(1).max(50).trim(),
  unitRate: z.number().min(0).max(UNIT_RATE_MAX),
  wastagePercent: z.number().min(0).max(100).default(0),
  notes: z.string().max(500).trim().optional().nullable(),
}).superRefine((data, ctx) => {
  const allowed = RESOURCE_UNITS[data.category];
  if (allowed && !allowed.includes(data.unit)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unit"],
      message: `Unit "${data.unit}" is not valid for category "${data.category}". Allowed: ${allowed.join(", ")}`,
    });
  }
});

function ck(orgId: string, category?: string) {
  return `resources:${orgId}:${category ?? "all"}`;
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
    const sp = req.nextUrl.searchParams;
    const rawCat = sp.get("category") ?? "";
    const category = VALID_CATEGORIES.includes(rawCat as ResourceCategory)
      ? (rawCat as ResourceCategory)
      : undefined;
    const search = sp.get("search")?.trim() ?? "";

    // Skip cache when a text search is active — results vary per query
    const key = ck(orgId, category);
    if (!search) {
      const hit = await redis.get(key).catch(() => null);
      if (hit) return NextResponse.json(JSON.parse(hit as string));
    }

    const resources = await prisma.orgResource.findMany({
      where: {
        orgId,
        ...(category ? { category } : {}),
        ...(search ? { OR: [{ name: { contains: search } }, { notes: { contains: search } }] } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: RESOURCES_FETCH_LIMIT,
    });

    const payload = { resources };
    if (!search) {
      redis.set(key, JSON.stringify(payload), "EX", CACHE_TTL).catch(() => {});
    }
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
    const resource = await prisma.orgResource.create({
      data: {
        orgId,
        name: data.name,
        category: data.category,
        unit: data.unit,
        unitRate: data.unitRate,
        wastagePercent: data.wastagePercent,
        notes: data.notes ?? null,
        priceUpdatedAt: new Date(),
      },
    });

    redis.del(ck(orgId, data.category)).catch(() => {});
    redis.del(ck(orgId)).catch(() => {});

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "resource.create",
      resourceId: resource.id,
      meta: { name: resource.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ resource }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
