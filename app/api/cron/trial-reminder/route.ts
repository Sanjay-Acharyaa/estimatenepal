import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendEmail, trialReminderEmailHtml, trialExpiredEmailHtml } from "@/lib/email";

// GET /api/cron/trial-reminder
// Sends trial reminder emails (3 days before expiry) and expiry emails (just expired).
// Protected by Authorization: Bearer {CRON_SECRET} header.
// Rate limited to once per hour via Redis key "cron:trial-reminder:last_run".
//
// Recommended schedule: every 6 hours via Vercel Cron or similar.
//
// DB index note:
//   The Org.trialEndsAt field is queried with a range filter (BETWEEN).
//   Add this index to prisma/schema.prisma for optimal performance at scale:
//     @@index([trialEndsAt])
//   Without this index, the query performs a full table scan on the Org table.
//   For early-stage usage (<10k orgs) this is acceptable; add the index before
//   the table grows beyond ~1,000 rows to maintain query performance.
//
// Email sending is fire-and-forget: we do not await the send calls.
// This means the route returns quickly even if email delivery is slow,
// and email failures are caught and logged without failing the cron job.

const RATE_LIMIT_KEY = "cron:trial-reminder:last_run";
const RATE_LIMIT_TTL = 3600; // 1 hour
const UPGRADE_URL = "https://estimatenepal.com/register";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // ── Authorization ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Redis rate limit: once per hour ────────────────────────────────────────
  try {
    const lastRun = await redis.get(RATE_LIMIT_KEY);
    if (lastRun !== null) {
      const secondsAgo = Math.floor((Date.now() - parseInt(lastRun, 10)) / 1000);
      const retryAfter = RATE_LIMIT_TTL - secondsAgo;
      return NextResponse.json(
        {
          error: "Rate limited. Trial reminder cron can only run once per hour.",
          retryAfterSeconds: retryAfter > 0 ? retryAfter : 0,
        },
        { status: 429 }
      );
    }
  } catch (redisErr) {
    // Redis unavailable — log and continue (fail open so emails still get sent)
    console.error("[trial-reminder] Redis rate-limit check failed:", (redisErr as Error).message);
  }

  const now = new Date();

  // ── Window calculations ────────────────────────────────────────────────────
  // Reminder: trial ends between now+2days and now+3days (3-day warning window)
  const reminderFrom = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const reminderTo = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Expired: trial ended between now-24hrs and now (just expired)
  const expiredFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredTo = now;

  let reminded = 0;
  let expired = 0;

  try {
    // ── Reminder emails: trials expiring in ~3 days ──────────────────────────
    // Single query per window — include owner user to avoid N+1
    const reminderOrgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: reminderFrom, lte: reminderTo }, planTier: "TRIAL" },
      select: {
        id: true,
        trialEndsAt: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
      },
    });

    for (const org of reminderOrgs) {
      const owner = org.users[0];
      if (!owner || !org.trialEndsAt) continue;
      reminded++;
      sendEmail({
        to: owner.email,
        subject: "Your Estimate Nepal trial ends in 3 days",
        html: trialReminderEmailHtml(owner.name, org.trialEndsAt, UPGRADE_URL),
      }).catch((err: Error) => {
        console.error(`[trial-reminder] reminder email failed for org ${org.id}:`, err.message);
      });
    }

    // ── Expiry emails ─────────────────────────────────────────────────────────
    const expiredOrgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: expiredFrom, lte: expiredTo }, planTier: "TRIAL" },
      select: {
        id: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
      },
    });

    for (const org of expiredOrgs) {
      const owner = org.users[0];
      if (!owner) continue;
      expired++;
      sendEmail({
        to: owner.email,
        subject: "Your Estimate Nepal trial has ended — upgrade to continue",
        html: trialExpiredEmailHtml(owner.name, UPGRADE_URL),
      }).catch((err: Error) => {
        console.error(`[trial-reminder] expiry email failed for org ${org.id}:`, err.message);
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trial-reminder] Database query failed:", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // ── Record last run timestamp in Redis (best-effort) ─────────────────────
  redis
    .set(RATE_LIMIT_KEY, Date.now().toString(), "EX", RATE_LIMIT_TTL)
    .catch((err: Error) => console.error("[trial-reminder] Failed to set Redis rate-limit key:", err.message));

  // ── Structured log ─────────────────────────────────────────────────────────
  console.log("[trial-reminder]", { reminded, expired, timestamp: new Date().toISOString() });

  return NextResponse.json({ reminded, expired });
}
