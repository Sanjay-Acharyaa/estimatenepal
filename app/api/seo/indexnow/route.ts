import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

// POST /api/seo/indexnow
// Pings IndexNow-compatible search engines (Bing, Yandex) with our public URLs.
// Protected by Authorization: Bearer {CRON_SECRET} header.
// Rate limited to once per hour via Redis key "indexnow:last_ping".
//
// IndexNow key file must be accessible at:
//   https://estimatenepal.com/estimatenepal2026indexnow.txt
// containing only the key string: estimatenepal2026indexnow

const INDEXNOW_KEY = "estimatenepal2026indexnow";
const HOST = "estimatenepal.com";
const RATE_LIMIT_KEY = "indexnow:last_ping";
const RATE_LIMIT_TTL = 3600; // 1 hour

const PUBLIC_URLS = [
  `https://${HOST}/`,
  `https://${HOST}/faq`,
  `https://${HOST}/about`,
  `https://${HOST}/register`,
  `https://${HOST}/login`,
];

const INDEXNOW_ENGINES = [
  { name: "bing", url: "https://api.indexnow.org/indexnow" },
  { name: "yandex", url: "https://yandex.com/indexnow" },
];

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // ── Authorization ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Redis rate limit: once per hour ────────────────────────────────────────
  try {
    const lastPing = await redis.get(RATE_LIMIT_KEY);
    if (lastPing !== null) {
      const secondsAgo = Math.floor((Date.now() - parseInt(lastPing, 10)) / 1000);
      const retryAfter = RATE_LIMIT_TTL - secondsAgo;
      return NextResponse.json(
        {
          error: "Rate limited. IndexNow can only be pinged once per hour.",
          retryAfterSeconds: retryAfter > 0 ? retryAfter : 0,
        },
        { status: 429 }
      );
    }
  } catch (redisErr) {
    // Redis unavailable — log and continue rather than blocking the ping
    console.error("[indexnow] Redis rate-limit check failed:", (redisErr as Error).message);
  }

  // ── Ping each engine ───────────────────────────────────────────────────────
  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: PUBLIC_URLS,
  };

  const results: Array<{ engine: string; status: number | null; ok: boolean; error?: string }> = [];

  await Promise.allSettled(
    INDEXNOW_ENGINES.map(async (engine) => {
      try {
        const res = await fetch(engine.url, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });

        results.push({
          engine: engine.name,
          status: res.status,
          // IndexNow returns 200 or 202 on success
          ok: res.status === 200 || res.status === 202,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[indexnow] Failed to ping ${engine.name}:`, message);
        results.push({ engine: engine.name, status: null, ok: false, error: message });
      }
    })
  );

  // ── Store last ping timestamp in Redis (best-effort) ──────────────────────
  redis
    .set(RATE_LIMIT_KEY, Date.now().toString(), "EX", RATE_LIMIT_TTL)
    .catch((err: Error) => console.error("[indexnow] Failed to set Redis rate-limit key:", err.message));

  const successfulEngines = results.filter((r) => r.ok).map((r) => r.engine);

  console.log("[indexnow]", {
    engines: results,
    urls: PUBLIC_URLS,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    success: successfulEngines.length > 0,
    engines: successfulEngines,
    urls: PUBLIC_URLS,
    results,
  });
}
