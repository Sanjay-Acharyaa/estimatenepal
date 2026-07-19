import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { CACHE_TTL } from "@/lib/cache-constants";

const createSchema = z.object({
  code: z.string().min(1).max(50).trim(),
  description: z.string().min(1).trim(),
  unit: z.string().min(1).max(50).trim(),
  baseRate: z.number().min(0),
  fiscalYear: z.string().min(4).max(10).trim(),
});

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const sp = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(sp);
    const search = (sp.get("search") ?? "").slice(0, 200);
    // Whitelist source values to prevent arbitrary enum injection into Prisma
    const VALID_SOURCES = ["DUDBC", "CUSTOM"] as const;
    type ValidSource = typeof VALID_SOURCES[number];
    const rawSource = sp.get("source") ?? "";
    const source: ValidSource | "" = VALID_SOURCES.includes(rawSource as ValidSource) ? rawSource as ValidSource : "";
    const batchId = sp.get("batchId") ?? "";

    const where = {
      AND: [
        // Org sees its own CUSTOM rates + global DUDBC rates
        { OR: [{ orgId: token.orgId as string }, { orgId: null }] },
        ...(source ? [{ source }] : []),
        ...(batchId === "none" ? [{ batchId: null }] : batchId ? [{ batchId }] : []),
        ...(search
          ? [{
              OR: [
                { code: { contains: search } },
                { description: { contains: search } },
              ],
            }]
          : []),
      ],
    };

    // Cache key encodes all filter dimensions. Use full search string to prevent key collisions.
    const cacheKey = `rates:${token.orgId}:${source}:${batchId}:${search}`;
    try {
      const hit = await redis.get(cacheKey);
      if (hit) {
        const cached = JSON.parse(hit) as { all: any[]; total: number };
        const data = cached.all.slice(skip, skip + limit);
        return NextResponse.json(paginatedResponse(data, cached.total, page, limit));
      }
    } catch {
      // Redis miss — fall through to DB
    }

    // Natural sort: numeric codes sort as numbers (1,2,3,10,100) not strings (1,10,100,2)
    // Cap at 5000 rows to prevent unbounded memory use at scale.
    const [allData, total] = await Promise.all([
      prisma.rateItem.findMany({ where, take: 5000 }),
      prisma.rateItem.count({ where }),
    ]);

    allData.sort((a, b) => {
      // Group by source first (DUDBC before CUSTOM alphabetically)
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      // Natural sort on code: if both fully numeric, compare as numbers
      const nA = Number(a.code);
      const nB = Number(b.code);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      // Mixed: numeric codes before alphanumeric
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      // Both alphanumeric: sort by length then value (E1.1, E1.2, E1.10...)
      if (a.code.length !== b.code.length) return a.code.length - b.code.length;
      return a.code.localeCompare(b.code);
    });

    // Cache the full sorted list; pagination is done in-memory from the cached array.
    redis.set(cacheKey, JSON.stringify({ all: allData, total }), "EX", CACHE_TTL).catch(() => {});

    const data = allData.slice(skip, skip + limit);

    return NextResponse.json(paginatedResponse(data, total, page, limit));
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

    // Only OWNER/ADMIN can create rates
    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const rate = await prisma.rateItem.create({
      data: {
        ...parsed.data,
        source: "CUSTOM",
        orgId: token.orgId as string,
      },
    });

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_item.created",
      resourceId: rate.id,
      meta: { code: parsed.data.code, description: parsed.data.description } as any,
      ipAddress: ip,
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
