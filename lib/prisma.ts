import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// connection_limit MUST be set via DATABASE_URL query param to avoid exhausting MySQL's
// max_connections (default 151) when multiple serverless replicas spin up.
// Recommended: connection_limit=5&pool_timeout=15 per replica + an external pooler (ProxySQL/PgBouncer).
// Example: mysql://user:pass@host:3306/db?connection_limit=5&pool_timeout=15
const dbUrl = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" && dbUrl && !dbUrl.includes("connection_limit=")) {
  // Warn loudly — don't throw (a degraded app beats a crashed one), but this MUST be fixed.
  console.error(
    "[prisma] CRITICAL: DATABASE_URL is missing connection_limit. " +
    "Without it Prisma defaults to ~10 connections per replica; " +
    "at 16+ replicas MySQL will hit max_connections and reject all new connections. " +
    "Add ?connection_limit=5&pool_timeout=15 to DATABASE_URL."
  );
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
          ],
  });

// Log any DB query that takes longer than 2 seconds in production.
// These show up in PM2 logs: pm2 logs nepaliestimate --lines 100 | grep slow-query
if (process.env.NODE_ENV === "production") {
  (prisma as any).$on("query", (e: any) => {
    if (e.duration > 2000) {
      console.warn(
        `[slow-query] ${e.duration}ms | ${e.query.slice(0, 120)}`
      );
    }
  });
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
