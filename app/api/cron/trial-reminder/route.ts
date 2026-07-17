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
import { getConfig } from "@/lib/config";

function makeHmacKey(input: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("[trial-reminder] NEXTAUTH_SECRET is not set");
  return createHmac("sha256", secret).update(input).digest("hex").slice(0, 20);
}

function feedbackKey(id: string): string {
  return makeHmacKey(id);
}

function unsubUrl(userId: string, baseUrl: string): string {
  return `${baseUrl}/api/email/unsubscribe?user=${userId}&key=${makeHmacKey(userId + ":unsubscribe")}`;
}

// M1: buildEmail passes unsubscribeUrl into the wrapper (wrapEmailHtml) instead of fragile string-replace.
// Fallback thunk receives the URL so both DB-template and hardcoded paths get the footer.
function buildEmail(
  emailType: string,
  tplMap: Map<string, TemplateFull>,
  vars: Record<string, string>,
  fallback: { subject: string; html: (unsubscribeUrl?: string) => string },
  unsubscribeUrl?: string,
): { subject: string; html: string } {
  const tpl = tplMap.get(emailType);
  if (tpl) {
    return { subject: tpl.subject, html: renderTemplate(tpl.bodyHtml, vars, unsubscribeUrl) };
  }
  return { subject: fallback.subject, html: fallback.html(unsubscribeUrl) };
}

function buildReasonButtonsHtml(reasons: { label: string; url: string }[]): string {
  const rows = reasons.map(r =>
    `<tr><td style="padding:6px 0"><a href="${r.url}" style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;color:#334155;text-decoration:none;font-size:14px;font-weight:500;text-align:center">${r.label.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a></td></tr>`
  ).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

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
// Rate limited via Redis SET NX (atomic — PM2 cluster safe).

const RATE_LIMIT_KEY = "cron:trial-reminder:last_run";
const RATE_LIMIT_TTL = 21600; // 6 hours in seconds

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const BASE_URL     = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
  const UPGRADE_URL  = `${BASE_URL}/pricing`;
  const DASHBOARD_URL = `${BASE_URL}/dashboard`;

  // A3: SET NX at START — atomic distributed lock prevents double-fire on PM2 cluster.
  // Unlike GET-then-SET, this is a single atomic operation: only one worker can acquire it.
  try {
    const acquired = await redis.set(RATE_LIMIT_KEY, Date.now().toString(), "EX", RATE_LIMIT_TTL, "NX");
    if (acquired === null) {
      return NextResponse.json({ error: "Rate limited — cron already running or recently ran." }, { status: 429 });
    }
  } catch (err) {
    console.error("[trial-reminder] Redis lock failed (proceeding without lock):", (err as Error).message);
  }

  const now = new Date();
  const sent = { day7: 0, day12: 0, reminder3d: 0, expired: 0, churn: 0, nps: 0, reengagement7: 0, reengagement14: 0, reengagement21: 0, dataWarning: 0, dataWiped: 0 };
  const fail = { day7: 0, day12: 0, reminder3d: 0, expired: 0, churn: 0, nps: 0, reengagement7: 0, reengagement14: 0, reengagement21: 0, dataWarning: 0, dataWiped: 0 };

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

    // C3: emailBouncedAt: null excludes users with hard bounces so we never retry dead addresses.
    // emailUnsubscribedAt: null excludes opted-out users at the DB level (no JS check needed).
    const ownerSelect = {
      where: { role: "OWNER" as const, emailBouncedAt: null, emailUnsubscribedAt: null },
      select: { id: true, name: true, email: true },
      take: 1,
    };

    // Load everything in one parallel batch.
    const [
      allTemplates,
      recentlySent,
      recentNpsSent,
      day7Orgs, day12Orgs, rem3Orgs, expiredOrgs,
      churnOrgs, re7Orgs, re14Orgs, re21Orgs,
      dw30Orgs, wipeOrgs, npsUsers,
      price,
      annualFreeMonths,
    ] = await Promise.all([
      getTemplates(),
      prisma.emailLog.findMany({
        where: { sentAt: { gte: since48h }, orgId: { not: null } },
        select: { orgId: true, emailType: true },
      }),
      prisma.emailLog.findMany({
        where: { sentAt: { gte: since48h }, emailType: "nps" },
        select: { recipientEmail: true },
      }),
      prisma.org.findMany({
        where: { createdAt: { gte: day7From, lte: day7To }, planTier: "TRIAL", plan: "FREE", trialEndsAt: { gt: now } },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: d12From, lte: d12To }, planTier: "TRIAL", plan: "FREE" },
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
        where: { trialEndsAt: { gte: re7From, lte: re7To }, planTier: "TRIAL", plan: "FREE" },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: re14From, lte: re14To }, planTier: "TRIAL", plan: "FREE" },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: re21From, lte: re21To }, planTier: "TRIAL", plan: "FREE" },
        select: { id: true, users: ownerSelect },
      }),
      prisma.org.findMany({
        where: { trialEndsAt: { gte: dw30From, lte: dw30To }, planTier: "TRIAL", plan: "FREE", dataWipedAt: null },
        select: { id: true, users: ownerSelect },
      }),
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
          emailBouncedAt: null, // C3: skip bounced users
        },
        select: { id: true, name: true, email: true },
      }),
      getConfig("price_solo_monthly"),
      getConfig("annual_free_months"),
    ]);

    const tplMap = new Map(allTemplates.map((t) => [t.emailType, t]));

    // Build dedup set from recent email logs.
    const sentSet = new Set(recentlySent.map((r) => `${r.orgId}:${r.emailType}`));
    for (const n of recentNpsSent) {
      sentSet.add(`nps:${n.recipientEmail}`);
    }

    const alreadySent = (orgId: string, emailType: string): boolean =>
      sentSet.has(`${orgId}:${emailType}`);

    const markSent = (orgId: string, emailType: string): void => {
      sentSet.add(`${orgId}:${emailType}`);
    };

    const sendAndLog = async (params: {
      to: string;
      subject: string;
      html: string;
      orgId?: string | null;
      recipientName: string;
      emailType: string;
    }): Promise<boolean> => {
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
    };

    const tally = (results: PromiseSettledResult<boolean>[]) => {
      const s = results.filter(r => r.status === "fulfilled" && r.value).length;
      return { sent: s, failed: results.length - s };
    };

    // ── A1: Build ALL send queues synchronously (dedup is safe since loops are sync),
    // then fire everything in one outer Promise.all for maximum throughput. ──────────

    // ── Day 7 check-in (C5: now includes unsubscribeUrl) ─────────────────────────
    const day7Sends: Promise<boolean>[] = [];
    for (const org of day7Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      if (alreadySent(org.id, "trial_day7")) continue;
      markSent(org.id, "trial_day7");
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("trial_day7", tplMap,
        { name: owner.name, dashboardUrl: DASHBOARD_URL },
        { subject: "How's your Estimate Nepal trial going?", html: (url?) => trialDay7EmailHtml(owner.name, DASHBOARD_URL, url) },
        u,
      );
      day7Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_day7" }));
    }

    // ── Day 12 urgency (C5: unsubscribeUrl) ─────────────────────────────────────
    const day12Sends: Promise<boolean>[] = [];
    for (const org of day12Orgs) {
      const owner = org.users[0];
      if (!owner || !org.trialEndsAt) continue;
      if (alreadySent(org.id, "trial_day12")) continue;
      markSent(org.id, "trial_day12");
      const expiryStr = org.trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("trial_day12", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL, trialEndsAt: expiryStr, price },
        { subject: "2 days left on your Estimate Nepal trial", html: (url?) => trialDay12EmailHtml(owner.name, UPGRADE_URL, org.trialEndsAt!, url, price) },
        u,
      );
      day12Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_day12" }));
    }

    // ── 3-day reminder (C5: unsubscribeUrl) ──────────────────────────────────────
    const rem3Sends: Promise<boolean>[] = [];
    for (const org of rem3Orgs) {
      const owner = org.users[0];
      if (!owner || !org.trialEndsAt) continue;
      if (alreadySent(org.id, "trial_reminder_3d")) continue;
      markSent(org.id, "trial_reminder_3d");
      const expiryStr = org.trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("trial_reminder_3d", tplMap,
        { name: owner.name, trialEndsAt: expiryStr, upgradeUrl: UPGRADE_URL, price, annualFreeMonths },
        { subject: "Your Estimate Nepal trial ends in 3 days", html: (url?) => trialReminderEmailHtml(owner.name, org.trialEndsAt!, UPGRADE_URL, url, price) },
        u,
      );
      rem3Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_reminder_3d" }));
    }

    // ── Just expired (C5: unsubscribeUrl) ────────────────────────────────────────
    const expiredSends: Promise<boolean>[] = [];
    for (const org of expiredOrgs) {
      const owner = org.users[0];
      if (!owner) continue;
      if (alreadySent(org.id, "trial_expired")) continue;
      markSent(org.id, "trial_expired");
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("trial_expired", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL, price },
        { subject: "Your Estimate Nepal trial has ended — upgrade to continue", html: (url?) => trialExpiredEmailHtml(owner.name, UPGRADE_URL, url, price) },
        u,
      );
      expiredSends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "trial_expired" }));
    }

    // ── Churn reason survey (always had unsubscribeUrl via M1) ───────────────────
    const churnSends: Promise<boolean>[] = [];
    for (const org of churnOrgs) {
      const owner = org.users[0];
      if (!owner) continue;
      if (alreadySent(org.id, "churn_reason")) continue;
      markSent(org.id, "churn_reason");
      const churnKey = feedbackKey(org.id);
      const reasons = [
        { label: "Too expensive",                  url: `${BASE_URL}/api/feedback/churn?reason=too_expensive&org=${org.id}&key=${churnKey}` },
        { label: "Missing features I need",        url: `${BASE_URL}/api/feedback/churn?reason=missing_features&org=${org.id}&key=${churnKey}` },
        { label: "Just exploring / not ready yet", url: `${BASE_URL}/api/feedback/churn?reason=just_exploring&org=${org.id}&key=${churnKey}` },
        { label: "Went with a competitor",         url: `${BASE_URL}/api/feedback/churn?reason=competitor&org=${org.id}&key=${churnKey}` },
        { label: "Too complex / hard to use",      url: `${BASE_URL}/api/feedback/churn?reason=too_complex&org=${org.id}&key=${churnKey}` },
        { label: "Not relevant to my work",        url: `${BASE_URL}/api/feedback/churn?reason=not_relevant&org=${org.id}&key=${churnKey}` },
      ];
      const feedbackTextUrl = `${BASE_URL}/feedback/churn-text?org=${org.id}&key=${churnKey}`;
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("churn_reason", tplMap,
        { name: owner.name, reasonButtons: buildReasonButtonsHtml(reasons), feedbackUrl: feedbackTextUrl },
        { subject: "One quick question about your trial", html: (url?) => churnReasonEmailHtml(owner.name, reasons, url, feedbackTextUrl) },
        u,
      );
      churnSends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "churn_reason" }));
    }

    // ── Day 7 post-expiry re-engagement ──────────────────────────────────────────
    const re7Sends: Promise<boolean>[] = [];
    for (const org of re7Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      if (alreadySent(org.id, "reengagement_7")) continue;
      markSent(org.id, "reengagement_7");
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("reengagement_7", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL, price },
        { subject: "We miss you — your Estimate Nepal data is still safe", html: (url?) => trialReengagement7EmailHtml(owner.name, UPGRADE_URL, url, price) },
        u,
      );
      re7Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "reengagement_7" }));
    }

    // ── Day 14 post-expiry ───────────────────────────────────────────────────────
    const re14Sends: Promise<boolean>[] = [];
    for (const org of re14Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      if (alreadySent(org.id, "reengagement_14")) continue;
      markSent(org.id, "reengagement_14");
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("reengagement_14", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL, price },
        { subject: "Your data is still waiting — come back to Estimate Nepal", html: (url?) => trialReengagement14EmailHtml(owner.name, UPGRADE_URL, url, price) },
        u,
      );
      re14Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "reengagement_14" }));
    }

    // ── Day 21 post-expiry ───────────────────────────────────────────────────────
    const re21Sends: Promise<boolean>[] = [];
    for (const org of re21Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      if (alreadySent(org.id, "reengagement_21")) continue;
      markSent(org.id, "reengagement_21");
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("reengagement_21", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL },
        { subject: "Last chance — your Estimate Nepal data will be removed in 9 days", html: (url?) => trialReengagement21EmailHtml(owner.name, UPGRADE_URL, url) },
        u,
      );
      re21Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "reengagement_21" }));
    }

    // ── Day 30 data warning ───────────────────────────────────────────────────────
    const dw30Sends: Promise<boolean>[] = [];
    for (const org of dw30Orgs) {
      const owner = org.users[0];
      if (!owner) continue;
      if (alreadySent(org.id, "data_warning")) continue;
      markSent(org.id, "data_warning");
      const u = unsubUrl(owner.id, BASE_URL);
      const { subject, html } = buildEmail("data_warning", tplMap,
        { name: owner.name, upgradeUrl: UPGRADE_URL },
        { subject: "Your Estimate Nepal data will be deleted in 24 hours", html: (url?) => trialDataWarningEmailHtml(owner.name, UPGRADE_URL, url) },
        u,
      );
      dw30Sends.push(sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "data_warning" }));
    }

    // ── NPS survey ────────────────────────────────────────────────────────────────
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
      const u = unsubUrl(user.id, BASE_URL);
      const { subject, html } = buildEmail("nps", tplMap,
        { name: user.name, scoreButtons: buildScoreButtonsHtml(scores) },
        { subject: "Quick question — how's Estimate Nepal working for you?", html: (url?) => npsEmailHtml(user.name, scores, url) },
        u,
      );
      npsSends.push(sendAndLog({ to: user.email, subject, html, recipientName: user.name, emailType: "nps" }));
    }

    // A1: Fire ALL send batches in parallel — queues were built synchronously so dedup is consistent.
    const [
      day7Results, day12Results, rem3Results, expiredResults,
      churnResults, re7Results, re14Results, re21Results,
      dw30Results, npsResults,
    ] = await Promise.all([
      Promise.allSettled(day7Sends),
      Promise.allSettled(day12Sends),
      Promise.allSettled(rem3Sends),
      Promise.allSettled(expiredSends),
      Promise.allSettled(churnSends),
      Promise.allSettled(re7Sends),
      Promise.allSettled(re14Sends),
      Promise.allSettled(re21Sends),
      Promise.allSettled(dw30Sends),
      // NPS: sends + npsSentAt update run in parallel with each other and all batches above
      npsUpdateIds.length > 0
        ? Promise.allSettled(npsSends).then(async (results) => {
            await prisma.user.updateMany({ where: { id: { in: npsUpdateIds } }, data: { npsSentAt: now } });
            return results;
          })
        : Promise.resolve([] as PromiseSettledResult<boolean>[]),
    ]);

    // Tally results
    const t7   = tally(day7Results);   sent.day7          = t7.sent;   fail.day7          = t7.failed;
    const t12  = tally(day12Results);  sent.day12         = t12.sent;  fail.day12         = t12.failed;
    const tr3  = tally(rem3Results);   sent.reminder3d    = tr3.sent;  fail.reminder3d    = tr3.failed;
    const te   = tally(expiredResults);sent.expired       = te.sent;   fail.expired       = te.failed;
    const tc   = tally(churnResults);  sent.churn         = tc.sent;   fail.churn         = tc.failed;
    const tr7  = tally(re7Results);    sent.reengagement7 = tr7.sent;  fail.reengagement7 = tr7.failed;
    const tr14 = tally(re14Results);   sent.reengagement14= tr14.sent; fail.reengagement14= tr14.failed;
    const tr21 = tally(re21Results);   sent.reengagement21= tr21.sent; fail.reengagement21= tr21.failed;
    const tdw  = tally(dw30Results);   sent.dataWarning   = tdw.sent;  fail.dataWarning   = tdw.failed;
    const tn   = tally(npsResults);    sent.nps           = tn.sent;   fail.nps           = tn.failed;

    // ── Day 31+: wipe project data (must stay sequential — DB deletes per org) ────
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
      const u = owner ? unsubUrl(owner.id, BASE_URL) : undefined;
      const { subject, html } = buildEmail("data_wiped", tplMap,
        { name: owner.name, baseUrl: BASE_URL },
        { subject: "Your Estimate Nepal trial data has been removed", html: (url?) => trialDataWipedEmailHtml(owner.name, BASE_URL, url) },
        u,
      );
      await sendAndLog({ to: owner.email, subject, html, orgId: org.id, recipientName: owner.name, emailType: "data_wiped" });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trial-reminder] Failed:", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  console.log("[trial-reminder]", { sent, failed: fail, timestamp: new Date().toISOString() });
  return NextResponse.json({ sent, failed: fail });
}
