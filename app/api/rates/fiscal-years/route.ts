export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { CACHE_TTL } from "@/lib/cache-constants";

const CACHE_KEY = "dudbc:fiscal-years";

// GET /api/rates/fiscal-years
// Returns distinct published DUDBC fiscal year strings, newest first.
// Cached under the same key that invalidateDudbcCaches() clears.
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    try {
      const hit = await redis.get(CACHE_KEY);
      if (hit) return NextResponse.json(JSON.parse(hit));
    } catch { /* Redis miss — fall through */ }

    const rows = await prisma.rateItem.findMany({
      where: { source: "DUDBC", isPublished: true },
      select: { fiscalYear: true },
      distinct: ["fiscalYear"],
      orderBy: { fiscalYear: "desc" },
    });

    const years = rows.map((r) => r.fiscalYear);
    redis.set(CACHE_KEY, JSON.stringify(years), "EX", CACHE_TTL).catch(() => {});

    return NextResponse.json(years);
  } catch (err) {
    return handleApiError(err);
  }
}
