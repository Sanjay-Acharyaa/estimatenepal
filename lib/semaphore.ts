import { redis } from "./redis";
import { NextResponse } from "next/server";

// Redis counter-based concurrency semaphore.
// Prevents more than `max` simultaneous invocations of a named heavy operation.
// Uses INCR/DECR; on acquire the key is given a generous TTL so a crashed worker
// can never permanently leak a slot.

export interface Semaphore {
  release(): Promise<void>;
}

export async function acquireSemaphore(
  name: string,
  max: number,
  ttlSeconds = 120
): Promise<Semaphore | null> {
  const key = `sem:${name}`;
  // Pipeline INCR + EXPIRE so a crash between them can't leave a key with no TTL
  const results = await redis.pipeline().incr(key).expire(key, ttlSeconds).exec();
  const current = (results?.[0]?.[1] as number | null) ?? 1;

  if (current > max) {
    // Over the limit — release our slot immediately and refuse
    await redis.decr(key);
    return null;
  }

  return {
    async release() {
      const val = await redis.decr(key);
      // Never let the counter go negative (shouldn't happen, but be defensive)
      if (val < 0) await redis.set(key, 0, "EX", ttlSeconds);
    },
  };
}

// Helper: acquire or return a 503 response immediately.
export async function withSemaphore<T>(
  name: string,
  max: number,
  fn: () => Promise<T>
): Promise<T | NextResponse> {
  const sem = await acquireSemaphore(name, max);
  if (!sem) {
    return NextResponse.json(
      { error: { code: "TOO_BUSY", message: `Too many concurrent ${name} operations. Try again shortly.` } },
      { status: 503 }
    );
  }
  try {
    return await fn();
  } finally {
    await sem.release();
  }
}
