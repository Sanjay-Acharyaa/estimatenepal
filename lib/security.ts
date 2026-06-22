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

// Login: 10 failed attempts per 15 minutes per ip:email
// Only failed/invalid attempts count — server errors and timeouts do not consume tokens.
const loginLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_login",
  points: 10,
  duration: 900,
  blockDuration: 900,
  insuranceLimiter: new RateLimiterMemory({ points: 2, duration: 900 }),
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

// Check only — does NOT consume a token. Returns true if already rate-limited.
export async function isLoginRateLimited(ip: string, email?: string): Promise<boolean> {
  const key = email ? `${ip}:${email.toLowerCase()}` : ip;
  try {
    await loginLimiter.get(key).then(res => {
      if (res && res.remainingPoints <= 0) throw new RateLimiterRes(res.msBeforeNext, res.consumedPoints);
    });
    return false;
  } catch (e) {
    if (e instanceof RateLimiterRes) return true;
    console.error("[rate-limit] isLoginRateLimited error:", (e as Error).message);
    return false;
  }
}

// Consume a token — called only on actual credential failures, not server errors.
export async function consumeLoginFailure(ip: string, email?: string): Promise<void> {
  const key = email ? `${ip}:${email.toLowerCase()}` : ip;
  try {
    await loginLimiter.consume(key);
  } catch (e) {
    if (!(e instanceof RateLimiterRes)) {
      console.error("[rate-limit] consumeLoginFailure error:", (e as Error).message);
    }
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

