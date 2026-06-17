import { redis } from "./redis";
import { prisma } from "./prisma";

const LATEST_FY_KEY = "latest_dudbc_fy";
const LATEST_FY_TTL = 600; // 10 minutes

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
    redis.set(LATEST_FY_KEY, rec.fiscalYear, "EX", LATEST_FY_TTL).catch(() => {});
  }
  return rec?.fiscalYear ?? null;
}

// Clears the fiscal-year cache key. Call after publish or fiscal-year delete.
export async function invalidateLatestFYCache(): Promise<void> {
  await redis.del(LATEST_FY_KEY);
}

// Clears all paginated rates list cache entries (pattern rates:*).
// Call after any import, publish, or delete that changes visible rate items.
export async function invalidateRatesCache(): Promise<void> {
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", "rates:*", "COUNT", 200);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  if (keys.length > 0) await redis.del(...keys);
}

// Invalidates both caches in one call.
export async function invalidateDudbcCaches(): Promise<void> {
  await Promise.all([invalidateLatestFYCache(), invalidateRatesCache()]);
}
