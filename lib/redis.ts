import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis };

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is not set.");
}

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    // Fail fast so a slow Redis doesn't cascade into request timeouts
    commandTimeout: 500,
    connectTimeout: 3000,
    retryStrategy: (times) => {
      if (times > 5) return null; // stop retrying after 5 attempts
      return Math.min(times * 100, 1000); // exponential back-off up to 1s
    },
  });

redis.on("error", (err) => {
  // Log but don't crash — callers must handle Redis errors gracefully
  console.error("[redis] Connection error:", err.message);
});

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
