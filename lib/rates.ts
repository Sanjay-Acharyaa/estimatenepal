import { redis } from "./redis";
import { prisma } from "./prisma";
import { LATEST_FY_CACHE_TTL } from "./cache-constants";

const LATEST_FY_KEY = "latest_dudbc_fy";

// Returns the most recently published DUDBC fiscal year string, Redis-cached.
export async function getLatestDudbcFY(): Promise<string | null> {
  const cached = await redis.get(LATEST_FY_KEY);
  if (cached) return cached;

  const rec = await prisma.rateItem.findFirst({
    where: { source: "DUDBC", isPublished: true },
    orderBy: { fiscalYear: "desc" },
    select: { fiscalYear: true },
  });

  if (rec?.fiscalYear) {
    redis.set(LATEST_FY_KEY, rec.fiscalYear, "EX", LATEST_FY_CACHE_TTL).catch(() => {});
  }
  return rec?.fiscalYear ?? null;
}

// Clears the fiscal-year cache key. Call after publish or fiscal-year delete.
export async function invalidateLatestFYCache(): Promise<void> {
  await redis.del(LATEST_FY_KEY);
}

// Clears paginated rates list cache entries.
// Pass orgId to scope the scan to one org (org-specific rate changes).
// Omit orgId only for global DUDBC changes that affect all orgs.
export async function invalidateRatesCache(orgId?: string): Promise<void> {
  const pattern = orgId ? `rates:${orgId}:*` : "rates:*";
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (batch.length > 0) await redis.del(...batch);
  } while (cursor !== "0");
}

// Invalidates both caches in one call.
export async function invalidateDudbcCaches(): Promise<void> {
  await Promise.all([invalidateLatestFYCache(), invalidateRatesCache()]);
}
