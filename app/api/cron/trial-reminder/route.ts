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
import { logEmail } from "@/lib/email-log";
import { getTemplates, renderTemplate, TemplateFull } from "@/lib/email-templates";

function makeHmacKey(input: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("[trial-reminder] NEXTAUTH_SECRET is not set");
  return createHmac("sha256", secret).update(input).digest("hex").slice(0, 20);
}

function feedbackKey(id: string): string {
  return makeHmacKey(id);
}

function unsubscribeUrl(userId: string, baseUrl: string): string {
  return `${baseUrl}/api/email/unsubscribe?user=${userId}&key=${makeHmacKey(userId + ":unsubscribe")}`;
}

function withUnsubscribe(html: string, url: string): string {
  const footer = `<p style="text-align:center;font-size:11px;color:#94a3b8;margin:16px 0 0">
    <a href="${url}" style="color:#94a3b8;text-decoration:underline">Unsubscribe from marketing emails</a>
  </p>`;
  return html.replace("</body>", `${footer}</body>`);
}

// C1: buildEmail now returns { subject, html } so DB template subject is used instead of
// the hardcoded string. Falls back to the TypeScript function + its subject string.
function buildEmail(
  emailType: string,
  tplMap: Map<string, TemplateFull>,
  vars: Record<string, string>,
  fallback: { subject: string; html: () => string }
): { subject: string; html: string } {
  const tpl = tplMap.get(emailType);
  if (tpl) {
    return { subject: tpl.subject, html: renderTemplate(tpl.bodyHtml, vars) };
  }
  return { subject: fallback.subject, html: fallback.html() };
}

// C2: Pre-generate reason button HTML for {{reasonButtons}} placeholder in DB template.
function buildReasonButtonsHtml(reasons: { label: string; url: string }[]): string {
  const rows = reasons.map(r =>
    `<tr><td style="padding:6px 0"><a href="${r.url}" style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;color:#334155;text-decoration:none;font-size:14px;font-weight:500;text-align:center">${r.label.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a></td></tr>`
  ).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

// C2: Pre-generate NPS score button HTML for {{scoreButtons}} placeholder in DB template.
function buildScoreButtonsHtml(scores: { score: number; url: string }[]): string {
  const cells = scores.map(s =>
    `<td style="padding:2px"><a href="${s.url}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;text-decoration:none;font-size:13px;font-weight:600">${s.score}</a></td>`
  ).join("");
  return `<table cellpadding="0" cellspacing="0" style="margin:0 0 4px"><tr>${cells}</tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px">
  <tr>
    <td style="color:#94a3b8;font-size:11px;text-align:left">0 = Not at all</td>
    <td style="color:#94a3b8;font-size:11px;text-align:right">10 = Definitely</td>
  </tr>
</table>`;
}

// GET /api/cron/trial-reminder
// Protected by Authorization: Bearer {CRON_SECRET}
// Rate limited to once per 6 hours via Redis.

const RATE_LIMIT_KEY = "cron:trial-reminder:last_run";
const RATE_LIMIT_TTL = 21600; // 6 hours

// maxDuration is Vercel-only — has no effect on PM2/custom server.js. Timeout is controlled by PM2.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const BASE_URL    = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
  const UPGRADE_URL = `${BASE_URL}/pricing`;
  const DASHBOARD_URL = `${BASE_URL}/dashboard`;

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
  // H4: Track sent vs failed separately. Counts are set post-allSettled, not pre-incremented.
  const sent = { day7: 0, day12: 0, reminder3d: 0, expired: 0, churn: 0, nps: 0, reengagement7: 0, reengagement14: 0, reengagement21: 0, dataWarning: 0, dataWiped: 0 };
  const fail = { day7: 0, day12: 0, reminder3d: 0, expired: 0, churn: 0, nps: 0, reengagement7: 0, reengagement14: 0, reengagement21: 0, dataWarning: 0, dataWiped: 0 };
  // Keep counts alias so logs/console still work
  const counts = sent;

  try {
    const since48h  = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const day7From  = new Date(now.getTime() - 8  * 24 * 60 * 60 * 1000);
    const day7To    = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const d12From   = new Date(now.getTime() + 2  * 24 * 60 * 60 * 1000);
    const d12To     = new Date(now.getTime() + 3  * 24 * 60 * 60 * 1000);
    const rem3From  = new Date(now.getTime() + 3  * 24 * 60 * 60 * 1000);
    const rem3To    = new Date(now.getTime() + 4  * 24 * 60 * 60 * 1000);
    const expFrom   = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const churnFrom = new Date(now.getTime() - 3  * 24 * 60 * 60 * 1000);
    const churnTo   = new Date(now.getTime() - 2  * 24 * 60 * 60 * 1000);
    const re7From   = new Date(now.getTime() - 8  * 24 * 60 * 60 * 1000);
    const re7To     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const re14From  = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const re14To    = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const re21From  = new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000);
    const re21To    = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const dw30From  = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    const dw30To    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const npsFrom   = new Date(now.getTime() - 8  * 24 * 60 * 60 * 1000);
    const npsTo     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);

    const ownerSelect = {
      where: { role: "OWNER" as const },
      select: { id: true, name: true, email: true, emailUnsubscribedAt: true },
      take: 1,
    };

    // Load everything in one parallel batch: templates, dedup logs, all org/user queries
    const [
      allTemplates,
      recentlySent,
      recentNpsSent, // H1: separate dedup for NPS (orgId is null)
      day7Orgs, day12Orgs, rem3Orgs, expiredOrgs,
      churnOrgs, re7Orgs, re14Orgs, re21Orgs,
      dw30Orgs, wipeOrgs, npsUsers,
    ] = await Promise.all([
      getTemplates(),
      prisma.emailLog.findMany({
        where: { sentAt: { gte: since48h }, orgId: { not: null } },
        select: { orgId: true, emailType: true },
      }),
      // H1: Load NPS emails by recipient (not orgId, since NPS logs have orgId=null)
      prisma.emailLog.findMany({
        where: { sentAt: { gte: since48h }, emailType: "nps" },
        select: { recipientEmail: true },
      }),
      prisma.org.findMany({
        where: { createdAt: { gte: day7From, lte: day7To }, planTier: "TRIAL", plan: "FREE", trialEndsAt: { gt: now } },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: d12From, lt: d12To }, planTier: "TRIAL", plan: "FREE" },
        select: { id: true, trialEndsAt: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: rem3From, lte: rem3To }, planTier: "TRIAL", plan: "FREE" },
        select: { id: true, trialEndsAt: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: expFrom, lte: now }, planTier: "TRIAL", plan: "FREE" },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: churnFrom, lte: churnTo }, planTier: "TRIAL", plan: "FREE", churnReason: null },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: re7From, lte: re7To }, planTier: "TRIAL", plan: "FREE", dataWipedAt: null },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: re14From, lte: re14To }, planTier: "TRIAL", plan: "FREE", dataWipedAt: null },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: re21From, lte: re21To }, planTier: "TRIAL", plan: "FREE", dataWipedAt: null },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: dw30From, lte: dw30To }, planTier: "TRIAL", plan: "FREE", dataWipedAt: null },
        select: { id: true, users: ownerSelect },
      }),
      // C4: Added plan: "FREE" to prevent wiping paid org data if planTier is stale
      prisma.org.findMany({
        where: {
          trialEndsAt: { lte: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000) },
          planTier: "TRIAL",
          plan: "FREE",
          dataWipedAt: null,
        },
        select: { id: true, users: ownerSelect, projects: { select: { id: true }, take: 1 } },
      }),
      prisma.user.findMany({
        where: {
          createdAt: { gte: npsFrom, lte: npsTo },
          isSuperAdmin: false,
          emailVerified: true,
          npsSentAt: null,
          orgId: { not: null },
          emailUnsubscribedAt: null,
        },
        select: { id: true, name: true, email: true },
      }),
    ]);

    const tplMap = new Map(allTemplates.map((t) => [t.emailType, t]));

    // Build dedup set: org-scoped emails as "orgId:emailType"
    const sentSet = new Set(recentlySent.map((r) => `${r.orgId}:${r.emailType}`));
    // H1: Also include NPS by email (no orgId)
    for (const n of recentNpsSent) {
      sentSet.add(`nps:${n.recipientEmail}`);
    }

    function alreadySent(orgId: string, emailType: string): boolean {
      return sentSet.has(`${orgId}:${emailType}`);
    }
    function markSent(orgId: string, emailType: string): void {
      sentSet.add(`${orgId}:${emailType}`);
    }

    // L2: Capture resendEmailId and pass to logEmail
    // H4: Returns true if email was sent successfully (never throws — errors are logged).
    async function sendAndLog(params: {
      to: string;
      subject: string;
      html: string;
      orgId?: string | null;
      recipientName: string;
      emailType: string;
    }): Promise<boolean> {
      let status: "sent" | "failed" = "sent";
      let errorMessage: string | undefined;
      let resendEmailId: string | null = null;
      try {
        resendEmailId = await sendEmail({ to: params.to, subject: params.subject, html: params.html });
      } catch (err) {
        status = "failed";
        errorMessage = (err as Error).message;
        console.error(`[trial-reminder] ${params.emailType} failed to ${params.to}:`, errorMessage);
      }
      logEmail({
        orgId: params.orgId,
        recipientEmail: params.to,
        recipientName: params.recipientName,
        emailType: params.emailType,
        subject: params.subject,
        status,
        errorMessage,
        resendEmailId,
      });
      return status === "sent";
    }

    function tally(results: PromiseSettledResult<boolean>[]) {
      const s = results.filter(r => r.status === "fulfilled" && r.value).length;
      return { sent: s, failed: results.length - s };
    }

    // ── Day 7 check-in ───────────────────────────────────────────────────────
    const day7Sends: Promise<boolean>[] = [];
    for (const org of day7Orgs) {
      const owner = org.users[0];
      if (!owner || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "trial_day7")) continue;
      markSent(org.id, "trial_day7");
      const { subject, html } = buildEmail("trial_day7", tplMap,
        { name: owner.name, dashboardUrl: DASHBOARD_URL },
        { subject: "How's your Estimate Nepal trial going?", html: () => trialDay7EmailHtml(owner.name, DASHBOARD_URL) }
      );
      day7Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_day7" }));
    }
    { const t = tally(await Promise.allSettled(day7Sends)); sent.day7 = t.sent; fail.day7 = t.failed; }

    // ── Day 12 urgency ───────────────────────────────────────────────────────
    const day12Sends: Promise<boolean>[] = [];
    for (const org of day12Orgs) {
      const owner = org.users[0];
      if (!owner || !org.trialEndsAt || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "trial_day12")) continue;
      markSent(org.id, "trial_day12");
      const expiryStr = org.trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const { subject, html } = buildEmail("trial_day12", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL, trialEndsAt: expiryStr },
        { subject: "2 days left on your Estimate Nepal trial", html: () => trialDay12EmailHtml(owner.name, UPGRADE_URL, org.trialEndsAt!) }
      );
      day12Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_day12" }));
    }
    { const t = tally(await Promise.allSettled(day12Sends)); sent.day12 = t.sent; fail.day12 = t.failed; }

    // ── 3-day reminder ───────────────────────────────────────────────────────
    const rem3Sends: Promise<boolean>[] = [];
    for (const org of rem3Orgs) {
      const owner = org.users[0];
      if (!owner || !org.trialEndsAt || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "trial_reminder_3d")) continue;
      markSent(org.id, "trial_reminder_3d");
      const expiryStr = org.trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const { subject, html } = buildEmail("trial_reminder_3d", tplMap,
        { name: owner.name, trialEndsAt: expiryStr, upgradeUrl: UPGRADE_URL },
        { subject: "Your Estimate Nepal trial ends in 3 days", html: () => trialReminderEmailHtml(owner.name, org.trialEndsAt!, UPGRADE_URL) }
      );
      rem3Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_reminder_3d" }));
    }
    { const t = tally(await Promise.allSettled(rem3Sends)); sent.reminder3d = t.sent; fail.reminder3d = t.failed; }

    // ── Just expired ─────────────────────────────────────────────────────────
    const expiredSends: Promise<boolean>[] = [];
    for (const org of expiredOrgs) {
      const owner = org.users[0];
      if (!owner || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "trial_expired")) continue;
      markSent(org.id, "trial_expired");
      const { subject, html } = buildEmail("trial_expired", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL },
        { subject: "Your Estimate Nepal trial has ended — upgrade to continue", html: () => trialExpiredEmailHtml(owner.name, UPGRADE_URL) }
      );
      expiredSends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_expired" }));
    }
    { const t = tally(await Promise.allSettled(expiredSends)); sent.expired = t.sent; fail.expired = t.failed; }

    // ── Churn reason survey ──────────────────────────────────────────────────
    const churnSends: Promise<boolean>[] = [];
    for (const org of churnOrgs) {
      const owner = org.users[0];
      if (!owner || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "churn_reason")) continue;
      markSent(org.id, "churn_reason");
      const churnKey = feedbackKey(org.id);
      const reasons = [
        { label: "Too expensive",                  url: `${BASE_URL}/api/feedback/churn?reason=too_expensive&org=${org.id}&key=${churnKey}` },
        { label: "Missing features I need",        url: `${BASE_URL}/api/feedback/churn?reason=missing_features&org=${org.id}&key=${churnKey}` },
        { label: "Just exploring / not ready yet", url: `${BASE_URL}/api/feedback/churn?reason=just_exploring&org=${org.id}&key=${churnKey}` },
        { label: "Went with a competitor",         url: `${BASE_URL}/api/feedback/churn?reason=competitor&org=${org.id}&key=${churnKey}` },
      ];
      // C2: Pass {{reasonButtons}} as a var for DB template rendering
      const { subject, html: rawHtml } = buildEmail("churn_reason", tplMap,
        { name: owner.name, reasonButtons: buildReasonButtonsHtml(reasons) },
        { subject: "One quick question about your trial", html: () => churnReasonEmailHtml(owner.name, reasons) }
      );
      const html = withUnsubscribe(rawHtml, unsubscribeUrl(owner.id, BASE_URL));
      churnSends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "churn_reason" }));
    }
    { const t = tally(await Promise.allSettled(churnSends)); sent.churn = t.sent; fail.churn = t.failed; }

    // ── Day 7 post-expiry re-engagement ──────────────────────────────────────
    const re7Sends: Promise<boolean>[] = [];
    for (const org of re7Orgs) {
      const owner = org.users[0];
      if (!owner || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "reengagement_7")) continue;
      markSent(org.id, "reengagement_7");
      const { subject, html: rawHtml } = buildEmail("reengagement_7", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL },
        { subject: "We miss you — your Estimate Nepal data is still safe", html: () => trialReengagement7EmailHtml(owner.name, UPGRADE_URL) }
      );
      const html = withUnsubscribe(rawHtml, unsubscribeUrl(owner.id, BASE_URL));
      re7Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "reengagement_7" }));
    }
    { const t = tally(await Promise.allSettled(re7Sends)); sent.reengagement7 = t.sent; fail.reengagement7 = t.failed; }

    // ── Day 14 post-expiry ───────────────────────────────────────────────────
    const re14Sends: Promise<boolean>[] = [];
    for (const org of re14Orgs) {
      const owner = org.users[0];
      if (!owner || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "reengagement_14")) continue;
      markSent(org.id, "reengagement_14");
      const { subject, html: rawHtml } = buildEmail("reengagement_14", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL },
        { subject: "Your data is still waiting — come back to Estimate Nepal", html: () => trialReengagement14EmailHtml(owner.name, UPGRADE_URL) }
      );
      const html = withUnsubscribe(rawHtml, unsubscribeUrl(owner.id, BASE_URL));
      re14Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "reengagement_14" }));
    }
    { const t = tally(await Promise.allSettled(re14Sends)); sent.reengagement14 = t.sent; fail.reengagement14 = t.failed; }

    // ── Day 21 post-expiry ───────────────────────────────────────────────────
    const re21Sends: Promise<boolean>[] = [];
    for (const org of re21Orgs) {
      const owner = org.users[0];
      if (!owner || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "reengagement_21")) continue;
      markSent(org.id, "reengagement_21");
      const { subject, html: rawHtml } = buildEmail("reengagement_21", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL },
        { subject: "Last chance — your Estimate Nepal data will be removed in 9 days", html: () => trialReengagement21EmailHtml(owner.name, UPGRADE_URL) }
      );
      const html = withUnsubscribe(rawHtml, unsubscribeUrl(owner.id, BASE_URL));
      re21Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "reengagement_21" }));
    }
    { const t = tally(await Promise.allSettled(re21Sends)); sent.reengagement21 = t.sent; fail.reengagement21 = t.failed; }

    // ── Day 30 data warning ──────────────────────────────────────────────────
    const dw30Sends: Promise<boolean>[] = [];
    for (const org of dw30Orgs) {
      const owner = org.users[0];
      if (!owner || owner.emailUnsubscribedAt) continue;
      if (alreadySent(org.id, "data_warning")) continue;
      markSent(org.id, "data_warning");
      const { subject, html: rawHtml } = buildEmail("data_warning", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL },
        { subject: "Your Estimate Nepal data will be deleted in 24 hours", html: () => trialDataWarningEmailHtml(owner.name, UPGRADE_URL) }
      );
      const html = withUnsubscribe(rawHtml, unsubscribeUrl(owner.id, BASE_URL));
      dw30Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "data_warning" }));
    }
    { const t = tally(await Promise.allSettled(dw30Sends)); sent.dataWarning = t.sent; fail.dataWarning = t.failed; }

    // ── Day 31+: wipe project data + notify (must stay sequential) ───────────
    for (const org of wipeOrgs) {
      const owner = org.users[0];
      if (!owner) continue;
      try {
        await prisma.project.deleteMany({ where: { orgId: org.id } });
        await prisma.org.update({ where: { id: org.id }, data: { dataWipedAt: now } });
        sent.dataWiped++;
      } catch (err) {
        fail.dataWiped++;
        console.error("[trial-reminder] dataWipe failed for", org.id, (err as Error).message);
        continue;
      }
      const { subject, html } = buildEmail("data_wiped", tplMap,
        { name: owner.name, baseUrl: BASE_URL },
        { subject: "Your Estimate Nepal trial data has been removed", html: () => trialDataWipedEmailHtml(owner.name, BASE_URL) }
      );
      await sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "data_wiped" });
    }

    // ── NPS survey (7 days into trial) ───────────────────────────────────────
    const npsSends: Promise<boolean>[] = [];
    const npsUpdateIds: string[] = [];
    for (const user of npsUsers) {
      if (sentSet.has(`nps:${user.email}`)) continue;
      sentSet.add(`nps:${user.email}`);
      npsUpdateIds.push(user.id);
      const npsKey = feedbackKey(user.id);
      const scores = Array.from({ length: 11 }, (_, i) => ({
        score: i,
        url: `${BASE_URL}/api/feedback/nps?score=${i}&user=${user.id}&key=${npsKey}`,
      }));
      // C2: Pass {{scoreButtons}} as a var for DB template rendering
      const { subject, html: rawHtml } = buildEmail("nps", tplMap,
        { name: user.name, scoreButtons: buildScoreButtonsHtml(scores) },
        { subject: "Quick question — how's Estimate Nepal working for you?", html: () => npsEmailHtml(user.name, scores) }
      );
      const html = withUnsubscribe(rawHtml, unsubscribeUrl(user.id, BASE_URL));
      npsSends.push(sendAndLog({ to: user.email, subject, html, recipientName: user.name, emailType: "nps" }));
    }
    // H1: Await email sends and npsSentAt update in parallel; count results separately.
    if (npsUpdateIds.length > 0) {
      const [npsResults] = await Promise.all([
        Promise.allSettled(npsSends),
        prisma.user.updateMany({ where: { id: { in: npsUpdateIds } }, data: { npsSentAt: now } }),
      ]);
      const t = tally(npsResults); sent.nps = t.sent; fail.nps = t.failed;
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trial-reminder] Failed:", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  redis
    .set(RATE_LIMIT_KEY, Date.now().toString(), "EX", RATE_LIMIT_TTL)
    .catch((err: Error) => console.error("[trial-reminder] Failed to set Redis key:", err.message));

  console.log("[trial-reminder]", { sent, failed: fail, timestamp: new Date().toISOString() });
  return NextResponse.json({ sent, failed: fail });
}
