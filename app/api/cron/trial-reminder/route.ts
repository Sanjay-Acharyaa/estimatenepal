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
  trialReengagement7EmailHtml,
  trialReengagement14EmailHtml,
  trialReengagement21EmailHtml,
  trialDataWarningEmailHtml,
  trialDataWipedEmailHtml,
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
  const counts = { day7: 0, day12: 0, reminder3d: 0, expired: 0, churn: 0, nps: 0, reengagement7: 0, reengagement14: 0, reengagement21: 0, dataWarning: 0, dataWiped: 0 };

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
      where: { trialEndsAt: { gte: d12From, lt: d12To }, planTier: "TRIAL" },
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

    // ── Day 7 post-expiry re-engagement ──────────────────────────────────────
    const re7From = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const re7To   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const re7Orgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: re7From, lte: re7To }, planTier: "TRIAL", dataWipedAt: null },
      select: { id: true, users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 } },
    });
    for (const org of re7Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      counts.reengagement7++;
      sendEmail({
        to: owner.email,
        subject: "We miss you — your Estimate Nepal data is still safe",
        html: trialReengagement7EmailHtml(owner.name, UPGRADE_URL),
      }).catch((err: Error) => console.error(`[trial-reminder] re7 email failed org ${org.id}:`, err.message));
    }

    // ── Day 14 post-expiry ────────────────────────────────────────────────────
    const re14From = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const re14To   = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const re14Orgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: re14From, lte: re14To }, planTier: "TRIAL", dataWipedAt: null },
      select: { id: true, users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 } },
    });
    for (const org of re14Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      counts.reengagement14++;
      sendEmail({
        to: owner.email,
        subject: "Your data is still waiting — come back to Estimate Nepal",
        html: trialReengagement14EmailHtml(owner.name, UPGRADE_URL),
      }).catch((err: Error) => console.error(`[trial-reminder] re14 email failed org ${org.id}:`, err.message));
    }

    // ── Day 21 post-expiry ────────────────────────────────────────────────────
    const re21From = new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000);
    const re21To   = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const re21Orgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: re21From, lte: re21To }, planTier: "TRIAL", dataWipedAt: null },
      select: { id: true, users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 } },
    });
    for (const org of re21Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      counts.reengagement21++;
      sendEmail({
        to: owner.email,
        subject: "Last chance — your Estimate Nepal data will be removed in 9 days",
        html: trialReengagement21EmailHtml(owner.name, UPGRADE_URL),
      }).catch((err: Error) => console.error(`[trial-reminder] re21 email failed org ${org.id}:`, err.message));
    }

    // ── Day 30 post-expiry: data deleted in 24 hours warning ─────────────────
    const dw30From = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    const dw30To   = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dw30Orgs = await prisma.org.findMany({
      where: { trialEndsAt: { gte: dw30From, lte: dw30To }, planTier: "TRIAL", dataWipedAt: null },
      select: { id: true, users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 } },
    });
    for (const org of dw30Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      counts.dataWarning++;
      sendEmail({
        to: owner.email,
        subject: "Your Estimate Nepal data will be deleted in 24 hours",
        html: trialDataWarningEmailHtml(owner.name, UPGRADE_URL),
      }).catch((err: Error) => console.error(`[trial-reminder] dataWarning email failed org ${org.id}:`, err.message));
    }

    // ── Day 31+ post-expiry: wipe project data + notify ──────────────────────
    const wipeOrgs = await prisma.org.findMany({
      where: {
        trialEndsAt: { lte: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000) },
        planTier: "TRIAL",
        dataWipedAt: null,
      },
      select: {
        id: true,
        users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
        projects: { select: { id: true }, take: 1 },
      },
    });
    for (const org of wipeOrgs) {
      const owner = org.users[0];
      if (!owner) continue;
      // Delete all project data (cascades to drawings, takeoff items, etc.)
      await prisma.project.deleteMany({ where: { orgId: org.id } });
      await prisma.org.update({ where: { id: org.id }, data: { dataWipedAt: now } });
      counts.dataWiped++;
      sendEmail({
        to: owner.email,
        subject: "Your Estimate Nepal trial data has been removed",
        html: trialDataWipedEmailHtml(owner.name),
      }).catch((err: Error) => console.error(`[trial-reminder] dataWiped email failed org ${org.id}:`, err.message));
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
