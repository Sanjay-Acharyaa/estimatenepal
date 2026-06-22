import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { redis } from "./redis";
import { NextResponse } from "next/server";

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is not set.");
}
if (!process.env.NEXTAUTH_URL) {
  throw new Error("NEXTAUTH_URL environment variable is not set.");
}

// Re-export so callers can always import from lib/security (as spec requires)
export { getSecurityHeaders } from "./headers";

// insuranceLimiter: in-memory fallback when Redis is unavailable.
// Prevents Redis downtime from cascading into a full API outage.
// Conservative limits — slightly more permissive than Redis limits to avoid false positives.

// Login: 5 attempts per 15 minutes
const loginLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_login",
  points: 5,
  duration: 900,
  blockDuration: 900,
  // Conservative insurance: 1 attempt/15min per replica avoids bypassing the global limit
  // even when Redis is down and multiple replicas each apply their own in-memory counter.
  insuranceLimiter: new RateLimiterMemory({ points: 1, duration: 900 }),
});

// API: 120 requests per minute
const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_api",
  points: 120,
  duration: 60,
  // 15 per replica — at 5 replicas that's still only 75 req/min total when Redis is down,
  // which is below the intended 120 limit and prevents the per-instance fallback from
  // multiplying to 5×60=300 req/min per IP.
  insuranceLimiter: new RateLimiterMemory({ points: 15, duration: 60 }),
});

// Upload: 30 per hour
const uploadLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_upload",
  points: 30,
  duration: 3600,
  insuranceLimiter: new RateLimiterMemory({ points: 5, duration: 3600 }),
});

// Returns true when rate-limited (caller should reject the request), false otherwise.
// Keyed by ip:email so users behind the same NAT (office, classroom) don't block each other.
export async function isLoginRateLimited(ip: string, email?: string): Promise<boolean> {
  const key = email ? `${ip}:${email.toLowerCase()}` : ip;
  try {
    await loginLimiter.consume(key);
    return false;
  } catch (e) {
    if (e instanceof RateLimiterRes) return true;
    // Redis error — fail open so an outage doesn't lock everyone out
    console.error("[rate-limit] isLoginRateLimited error:", (e as Error).message);
    return false;
  }
}

export async function checkLoginRateLimit(ip: string, email?: string) {
  const key = email ? `${ip}:${email.toLowerCase()}` : ip;
  try {
    await loginLimiter.consume(key);
    return null;
  } catch (e) {
    if (e instanceof RateLimiterRes) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }
    // Redis error — fail open
    console.error("[rate-limit] checkLoginRateLimit error:", (e as Error).message);
    return null;
  }
}

export async function checkApiRateLimit(ip: string) {
  try {
    await apiLimiter.consume(ip);
    return null;
  } catch (e) {
    if (e instanceof RateLimiterRes) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }
    throw e;
  }
}

export function getClientIp(req: import("next/server").NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

export async function checkUploadRateLimit(ip: string) {
  try {
    await uploadLimiter.consume(ip);
    return null;
  } catch (e) {
    if (e instanceof RateLimiterRes) {
      return NextResponse.json(
        { error: "Upload limit reached. Max 30 uploads per hour." },
        { status: 429 }
      );
    }
    throw e;
  }
}

