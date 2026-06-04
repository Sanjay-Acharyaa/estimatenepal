import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { redis } from "./redis";
import { NextResponse } from "next/server";

// Login: 5 attempts per 15 minutes
const loginLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_login",
  points: 5,
  duration: 900,
  blockDuration: 900,
});

// API: 120 requests per minute
const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_api",
  points: 120,
  duration: 60,
});

// Upload: 5 per hour
const uploadLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl_upload",
  points: 5,
  duration: 3600,
});

export async function checkLoginRateLimit(ip: string) {
  try {
    await loginLimiter.consume(ip);
    return null;
  } catch (e) {
    if (e instanceof RateLimiterRes) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }
    throw e;
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

export async function checkUploadRateLimit(ip: string) {
  try {
    await uploadLimiter.consume(ip);
    return null;
  } catch (e) {
    if (e instanceof RateLimiterRes) {
      return NextResponse.json(
        { error: "Upload limit reached. Max 5 uploads per hour." },
        { status: 429 }
      );
    }
    throw e;
  }
}

