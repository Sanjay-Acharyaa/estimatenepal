import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import {
  sendEmail,
  trialDay7EmailHtml,
  trialDay12EmailHtml,
  trialReminderEmailHtml,
  trialExpiredEmailHtml,
  churnReasonEmailHtml,
  npsEmailHtml,
} from "@/lib/email";

function feedbackKey(id: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "fallback").update(id).digest("hex").slice(0, 20);
}

// GET /api/cron/trial-reminder
// Handles all lifecycle emails for trial users.
// Protected by Authorization: Bearer {CRON_SECRET} header.
// Rate limited to once per hour via Redis key "cron:trial-reminder:last_run".
// Recommended schedule: every 6 hours.

const RATE_LIMIT_KEY = "cron:trial-reminder:last_run";
const RATE_LIMIT_TTL = 3600;
const BASE_URL = "https://estimatenepal.com";
const UPGRADE_URL = `${BASE_URL}/pricing`;
const DASHBOARD_URL = `${BASE_URL}/dashboard`;

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lastRun = await redis.get(RATE_LIMIT_KEY);
    if (lastRun !== null) {
      const secondsAgo = Math.floor((Date.now() - parseInt(lastRun, 10)) / 1000);
      return NextResponse.json(
        { error: "Rate limited.", retryAfterSeconds: Math.max(RATE_LIMIT_TTL - secondsAgo, 0) },
        { status: 429 }
      );
    }
  } catch (err) {
    console.error("[trial-reminder] Redis rate-limit check failed:", (err as Error).message);
  }

  const now = new Date();
  const counts = { day7: 0, day12: 0, reminder3d: 0, expired: 0, churn: 0, nps: 0 };

  try {
    // ── Day 7 check-in: org created 7-8 days ago, still on trial ─────────────
    const day7From = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const day7To   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const day7Orgs = await prisma.org.findMany({
      where: { createdAt: { gte: day7From, lte: day7To }, planTier: "TRIAL", trialEndsAt: { gt: now } },
      select: {
        id: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
      },
    });
    for (const org of day7Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      counts.day7++;
      sendEmail({
        to: owner.email,
        subject: "How's your Estimate Nepal trial going?",
        html: trialDay7EmailHtml(owner.name, DASHBOARD_URL),
      }).catch((err: Error) => console.error(`[trial-reminder] day7 email failed org ${org.id}:`, err.message));
    }

    // ── Day 12 urgency: trial ends in 2-3 days ────────────────────────────────
    const d12From = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const d12To   = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const day12Orgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: d12From, lte: d12To }, planTier: "TRIAL" },
      select: {
        id: true, trialEndsAt: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
      },
    });
    for (const org of day12Orgs) {
      const owner = org.users[0];
      if (!owner || !org.trialEndsAt) continue;
      counts.day12++;
      sendEmail({
        to: owner.email,
        subject: "2 days left on your Estimate Nepal trial",
        html: trialDay12EmailHtml(owner.name, UPGRADE_URL, org.trialEndsAt),
      }).catch((err: Error) => console.error(`[trial-reminder] day12 email failed org ${org.id}:`, err.message));
    }

    // ── 3-day reminder (existing behaviour) ───────────────────────────────────
    const rem3From = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const rem3To   = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const rem3Orgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: rem3From, lte: rem3To }, planTier: "TRIAL" },
      select: {
        id: true, trialEndsAt: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
      },
    });
    for (const org of rem3Orgs) {
      const owner = org.users[0];
      if (!owner || !org.trialEndsAt) continue;
      counts.reminder3d++;
      sendEmail({
        to: owner.email,
        subject: "Your Estimate Nepal trial ends in 3 days",
        html: trialReminderEmailHtml(owner.name, org.trialEndsAt, UPGRADE_URL),
      }).catch((err: Error) => console.error(`[trial-reminder] 3d reminder failed org ${org.id}:`, err.message));
    }

    // ── Just expired: trial ended in last 24 hours ────────────────────────────
    const expFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const expiredOrgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: expFrom, lte: now }, planTier: "TRIAL" },
      select: {
        id: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
      },
    });
    for (const org of expiredOrgs) {
      const owner = org.users[0];
      if (!owner) continue;
      counts.expired++;
      sendEmail({
        to: owner.email,
        subject: "Your Estimate Nepal trial has ended — upgrade to continue",
        html: trialExpiredEmailHtml(owner.name, UPGRADE_URL),
      }).catch((err: Error) => console.error(`[trial-reminder] expiry email failed org ${org.id}:`, err.message));
    }

    // ── Churn reason: trial expired 2-3 days ago, no upgrade ─────────────────
    const churnFrom = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const churnTo   = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const churnOrgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: churnFrom, lte: churnTo }, planTier: "TRIAL", churnReason: null },
      select: {
        id: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
      },
    });
    for (const org of churnOrgs) {
      const owner = org.users[0];
      if (!owner) continue;
      counts.churn++;
      const churnKey = feedbackKey(org.id);
      const reasons = [
        { label: "Too expensive", url: `${BASE_URL}/api/feedback/churn?reason=too_expensive&org=${org.id}&key=${churnKey}` },
        { label: "Missing features I need", url: `${BASE_URL}/api/feedback/churn?reason=missing_features&org=${org.id}&key=${churnKey}` },
        { label: "Just exploring / not ready yet", url: `${BASE_URL}/api/feedback/churn?reason=just_exploring&org=${org.id}&key=${churnKey}` },
        { label: "Went with a competitor", url: `${BASE_URL}/api/feedback/churn?reason=competitor&org=${org.id}&key=${churnKey}` },
      ];
      sendEmail({
        to: owner.email,
        subject: "One quick question about your trial",
        html: churnReasonEmailHtml(owner.name, reasons),
      }).catch((err: Error) => console.error(`[trial-reminder] churn email failed org ${org.id}:`, err.message));
    }

    // ── NPS: users who registered 7-8 days ago, haven't received NPS yet ──────
    const npsFrom = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const npsTo   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const npsUsers = await prisma.user.findMany({
      where: {
        createdAt: { gte: npsFrom, lte: npsTo },
        isSuperAdmin: false,
        emailVerified: true,
        npsSentAt: null,
        orgId: { not: null },
      },
      select: { id: true, name: true, email: true },
    });
    for (const user of npsUsers) {
      counts.nps++;
      const npsKey = feedbackKey(user.id);
      const scores = Array.from({ length: 11 }, (_, i) => ({
        score: i,
        url: `${BASE_URL}/api/feedback/nps?score=${i}&user=${user.id}&key=${npsKey}`,
      }));
      sendEmail({
        to: user.email,
        subject: "Quick question — how's Estimate Nepal working for you?",
        html: npsEmailHtml(user.name, scores),
      }).catch((err: Error) => console.error(`[trial-reminder] NPS email failed user ${user.id}:`, err.message));
      // Mark NPS as sent
      prisma.user.update({ where: { id: user.id }, data: { npsSentAt: now } }).catch(() => {});
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trial-reminder] Database query failed:", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  redis
    .set(RATE_LIMIT_KEY, Date.now().toString(), "EX", RATE_LIMIT_TTL)
    .catch((err: Error) => console.error("[trial-reminder] Failed to set Redis key:", err.message));

  console.log("[trial-reminder]", { ...counts, timestamp: new Date().toISOString() });
  return NextResponse.json(counts);
}
