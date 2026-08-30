import { Resend } from "resend";
import { wrapEmailHtml } from "@/lib/email-template-constants";

function planPrice(price?: string): string {
  return `NPR ${price ?? "1499"}/month`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "#";
    return url;
  } catch {
    return "#";
  }
}

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<string | null> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM env var is not set");

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Timeout after 10 seconds — prevents a slow Resend API from stalling the cron
  const sendPromise = resend.emails.send({ from, to, subject, html, attachments });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Resend API timeout after 10s")), 10000)
  );
  const result = await Promise.race([sendPromise, timeoutPromise]);
  return (result as any)?.data?.id ?? (result as any)?.id ?? null;
}

// Use first name only in lifecycle email greetings
function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

const SUPPORT_EMAIL = "hello@estimatenepal.com";
const supportLink = `<a href="mailto:${SUPPORT_EMAIL}" style="color:#94a3b8;text-decoration:none">${SUPPORT_EMAIL}</a>`;
const supportLinkBlue = `<a href="mailto:${SUPPORT_EMAIL}" style="color:#1d4ed8;text-decoration:none">${SUPPORT_EMAIL}</a>`;

function ctaButton(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:28px 0">
    <tr><td style="background:#1d4ed8;border-radius:8px">
      <a href="${safeUrl(url)}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px">${label}</a>
    </td></tr>
  </table>`;
}

export function verificationEmailHtml(url: string, name: string) {
  const safeName = escapeHtml(name);
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Verify your email address</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 8px">
      Welcome to Estimate Nepal! Click the button below to verify your email address and activate your workspace.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 4px">This link expires in <strong>24 hours</strong>.</p>
    ${ctaButton(url, "Verify Email Address →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      If you didn&apos;t create an Estimate Nepal account, you can safely ignore this email.
    </p>
  `);
}

export function inviteEmailHtml(inviteUrl: string, orgName: string, inviterName: string, role: string) {
  const safeOrgName = escapeHtml(orgName);
  const safeInviterName = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 20px">You&apos;ve been invited</h2>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      <strong>${safeInviterName}</strong> has invited you to join <strong>${safeOrgName}</strong> on Estimate Nepal as a <strong>${safeRole}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 8px">
      <p style="color:#475569;font-size:14px;margin:0">
        Estimate Nepal is Nepal&apos;s smart construction platform for BOQ generation, tendering, and project management.
      </p>
    </div>
    <p style="color:#94a3b8;font-size:13px;margin:8px 0 4px">This invitation expires in <strong>72 hours</strong>.</p>
    ${ctaButton(inviteUrl, "Accept Invitation →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      If you weren&apos;t expecting this invitation, you can safely ignore this email.
    </p>
  `);
}

export function proposalEmailHtml(shareUrl: string, projectName: string, orgName: string, senderName: string) {
  const safeProjectName = escapeHtml(projectName);
  const safeOrgName = escapeHtml(orgName);
  const safeSenderName = escapeHtml(senderName);
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 20px">Project Proposal Shared</h2>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      <strong>${safeSenderName}</strong> from <strong>${safeOrgName}</strong> has shared a project proposal with you.
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#1e40af;font-size:14px;font-weight:600;margin:0 0 4px">Project</p>
      <p style="color:#1d4ed8;font-size:17px;font-weight:700;margin:0">${safeProjectName}</p>
    </div>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
      Review the proposal and let them know your response. You can approve or reject directly from the link below.
    </p>
    ${ctaButton(shareUrl, "Review Proposal →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      This link is unique to you. If you weren&apos;t expecting this, you can safely ignore this email.
    </p>
  `);
}

export function passwordResetEmailHtml(url: string) {
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 20px">Reset your password</h2>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 8px">
      We received a request to reset the password for your Estimate Nepal account.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 4px">This link expires in <strong>1 hour</strong>.</p>
    ${ctaButton(url, "Reset Password →")}
    <div style="background:#fef9f0;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-top:8px">
      <p style="color:#92400e;font-size:13px;margin:0">
        <strong>Didn&apos;t request this?</strong> Your password has not changed. You can safely ignore this email.
      </p>
    </div>
  `);
}

export function trialReminderEmailHtml(
  name: string,
  trialEndsAt: Date,
  upgradeUrl: string,
  unsubscribeUrl?: string,
  price?: string,
  annualFreeMonths?: string,
): string {
  const safeName = escapeHtml(firstName(name));
  const expiryDateStr = trialEndsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Your trial ends in 3 days</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your free trial expires on <strong>${expiryDateStr}</strong>. After that, you cannot create new BOQs, export tender documents, or upload drawings. Your existing work stays safe.
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#1e40af;font-size:14px;font-weight:600;margin:0 0 8px">What you&apos;ll lose without a plan:</p>
      <ul style="color:#1d4ed8;font-size:14px;margin:0;padding-left:20px;line-height:1.8">
        <li>BOQ generation and rate analysis</li>
        <li>PDF drawing takeoff and measurements</li>
        <li>PDF &amp; Excel tender document export</li>
        <li>Team collaboration features</li>
      </ul>
    </div>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      Your projects, drawings, and data will <strong>remain safe.</strong> You just need to upgrade to keep working.
    </p>
    ${ctaButton(upgradeUrl, "View Plans →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Plans start from ${planPrice(price)} for a single user. Annual billing saves you ${annualFreeMonths ?? "2"} months free.
      Questions? Reply to this email or write to ${supportLink}.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:12px 0 0">
      P.S. If timing is the issue and you need a few more days, reply and tell us. We can work something out.
    </p>
  `, unsubscribeUrl);
}

export function trialDay7EmailHtml(name: string, dashboardUrl: string, unsubscribeUrl?: string): string {
  const safeName = escapeHtml(firstName(name));
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">How&apos;s your first week going?</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      You&apos;re 7 days into your Estimate Nepal trial. Have you had a chance to explore everything yet?
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 10px">Quick wins to try before your trial ends:</p>
      <ul style="color:#475569;font-size:14px;margin:0;padding-left:20px;line-height:2">
        <li>Upload a drawing and run a takeoff measurement</li>
        <li>Generate a BOQ from your takeoff data</li>
        <li>Export a PDF tender document</li>
        <li>Invite a team member to collaborate</li>
      </ul>
    </div>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      Need help getting set up? Reply to this email or reach us at ${supportLinkBlue}. We usually respond within a few hours.
    </p>
    ${ctaButton(dashboardUrl, "Continue in Dashboard →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      You have 7 days remaining on your free trial.
    </p>
  `, unsubscribeUrl);
}

export function trialDay12EmailHtml(name: string, upgradeUrl: string, trialEndsAt: Date, unsubscribeUrl?: string, price?: string): string {
  const safeName = escapeHtml(firstName(name));
  const expiryDateStr = trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return wrapEmailHtml(`
    <h2 style="color:#dc2626;font-size:22px;font-weight:700;margin:0 0 8px">2 days left on your trial</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your Estimate Nepal trial expires on <strong>${expiryDateStr}</strong>. After that, you won&apos;t be able to create new exports, upload drawings, or edit projects.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#991b1b;font-size:14px;font-weight:600;margin:0 0 8px">Don&apos;t lose your work:</p>
      <ul style="color:#7f1d1d;font-size:14px;margin:0;padding-left:20px;line-height:1.8">
        <li>All drawings and measurements preserved</li>
        <li>BOQs and rate analyses kept</li>
        <li>Project history maintained</li>
        <li>Team access continues</li>
      </ul>
    </div>
    <p style="color:#334155;font-size:15px;margin:0 0 4px">
      Plans from <strong>${planPrice(price)}</strong>. Upgrade now and keep working without interruption.
    </p>
    ${ctaButton(upgradeUrl, "Upgrade Now →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Questions about pricing? Reply to this email or write to ${supportLink}.
    </p>
  `, unsubscribeUrl);
}

export function churnReasonEmailHtml(
  name: string,
  reasons: { label: string; url: string }[],
  unsubscribeUrl?: string,
  feedbackUrl?: string,
): string {
  const safeName = escapeHtml(firstName(name));
  const reasonButtons = reasons.map(r =>
    `<tr><td style="padding:5px 0">
      <a href="${safeUrl(r.url)}" style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;color:#334155;text-decoration:none;font-size:14px;font-weight:500;text-align:center">
        ${escapeHtml(r.label)}
      </a>
    </td></tr>`
  ).join("");

  const somethingElseRow = feedbackUrl
    ? `<tr><td style="padding:5px 0">
        <a href="${safeUrl(feedbackUrl)}" style="display:block;background:#ffffff;border:1px dashed #cbd5e1;border-radius:8px;padding:12px 20px;color:#64748b;text-decoration:none;font-size:14px;font-weight:500;text-align:center">
          Something else: tell us in your own words...
        </a>
      </td></tr>`
    : "";

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">One quick question</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px">
      Your trial ended. What stopped you?
    </p>
    <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px">Why didn&apos;t you continue?</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${reasonButtons}
      ${somethingElseRow}
    </table>
    <p style="color:#94a3b8;font-size:13px;margin:28px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Changed your mind? Your data is still safe. Reply to this email or write to
      ${supportLink} and we will sort you out.
    </p>
  `, unsubscribeUrl);
}

export function churnThanksEmailHtml(name: string, upgradeUrl?: string, reason?: string): string {
  const safeName = escapeHtml(firstName(name));
  const pricingUrl = upgradeUrl ?? "https://estimatenepal.com/pricing";

  // Reason-specific follow-up paragraph — contextual, conversion-focused
  let reasonNote = "";
  if (reason === "too_expensive") {
    reasonNote = `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      If cost was the main concern, the annual plan comes to significantly less per month.
      Or just reply to this email — we have helped other small firms find an option that works for them.
    </p>`;
  } else if (reason === "missing_features") {
    reasonNote = `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      We are actively building based on what users tell us. If something specific was missing,
      reply and let us know — we may already have it or have it scheduled. We will be honest with you.
    </p>`;
  } else if (reason === "just_exploring") {
    reasonNote = `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      When a real project comes up and you need accurate BOQs or takeoffs fast, we will be here.
      Your trial data stays safe until then.
    </p>`;
  } else if (reason === "competitor") {
    reasonNote = `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      We hope the new tool serves you well. If you ever want to compare or come back, we are here.
      Estimate Nepal is built specifically for Nepal&apos;s rates, formats, and workflows — that difference tends to matter.
    </p>`;
  } else if (reason === "too_complex") {
    reasonNote = `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      We hear that. If you are open to it, we offer a free onboarding session —
      15 minutes on a video call and most users find the workflow clicks immediately.
      Reply to this email and we will set it up.
    </p>`;
  }

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Thank you for telling us</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Thank you for taking the time to tell us why you stopped. We read every response. Yours has been noted.
    </p>
    ${reasonNote}
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      If you change your mind, your projects and data are still here.
      You can upgrade at any time and pick up exactly where you left off.
    </p>
    ${ctaButton(pricingUrl, "See What Fits Your Budget →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      If there is more you want to share about what was missing or what could be better, reply to this email or write to
      ${supportLink}. We read these personally.
    </p>
  `);
}

export function npsEmailHtml(name: string, scores: { score: number; url: string }[], unsubscribeUrl?: string): string {
  const safeName = escapeHtml(firstName(name));
  const scoreButtons = scores.map(s =>
    `<td style="padding:2px"><a href="${safeUrl(s.url)}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;text-decoration:none;font-size:13px;font-weight:600">${s.score}</a></td>`
  ).join("");

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">How likely are you to recommend us?</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px">
      You&apos;ve been using Estimate Nepal for 10 days. How&apos;s it going? On a scale of 0 to 10, how likely are you to recommend us to a colleague in construction or engineering?
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px">
      <tr>${scoreButtons}</tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px">
      <tr>
        <td style="color:#94a3b8;font-size:11px;text-align:left">0 = Not at all</td>
        <td style="color:#94a3b8;font-size:11px;text-align:right">10 = Definitely</td>
      </tr>
    </table>
    <p style="color:#94a3b8;font-size:13px;margin:0;padding-top:24px;border-top:1px solid #f1f5f9">
      This takes 1 click and helps us improve. Thank you for your time.
    </p>
  `, unsubscribeUrl);
}

export function npsDetractorFollowupEmailHtml(name: string, score: number): string {
  const safeName = escapeHtml(firstName(name));
  const safeScore = Number(score);
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">You gave us a ${safeScore} — thank you for being honest</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      You rated us <strong>${safeScore} out of 10</strong>. That tells us something is not right, and we want to fix it.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Could you spare two minutes to tell us what went wrong? Specifically:
    </p>
    <ul style="color:#334155;font-size:15px;line-height:1.8;margin:0 0 16px;padding-left:20px">
      <li>What were you trying to do when things went wrong?</li>
      <li>What did you expect to happen?</li>
      <li>What happened instead?</li>
    </ul>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      Just reply to this email. We read every message and we will get back to you personally.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      Or write directly to ${supportLinkBlue}. Either way, a real person reads it.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your feedback directly shapes what we build next. Thank you for taking the time.
    </p>
  `);
}

export function proposalResponseAdminEmailHtml(
  projectName: string,
  clientName: string,
  action: "APPROVED" | "REJECTED",
  note: string | null | undefined,
  projectUrl: string
): string {
  const safeProject = escapeHtml(projectName);
  const safeClient = escapeHtml(clientName);
  const safeNote = note ? escapeHtml(note) : null;
  const isApproved = action === "APPROVED";
  const badgeColor = isApproved ? "#16a34a" : "#dc2626";
  const badgeBg = isApproved ? "#f0fdf4" : "#fef2f2";
  const badgeBorder = isApproved ? "#bbf7d0" : "#fecaca";
  const label = isApproved ? "Approved" : "Rejected";

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Proposal ${label}</h2>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px">
      <strong>${safeClient}</strong> has responded to the proposal for <strong>${safeProject}</strong>.
    </p>
    <div style="background:${badgeBg};border:1px solid ${badgeBorder};border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:${badgeColor};font-size:16px;font-weight:700;margin:0">${label} by ${safeClient}</p>
      ${safeNote ? `<p style="color:#475569;font-size:14px;margin:10px 0 0"><strong>Note:</strong> ${safeNote}</p>` : ""}
    </div>
    ${ctaButton(projectUrl, "View Project →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Go to the project&apos;s Proposal tab to review details and take next steps.
    </p>
  `);
}

export function proposalResponseClientEmailHtml(
  projectName: string,
  clientName: string,
  orgName: string,
  action: "APPROVED" | "REJECTED",
  note: string | null | undefined
): string {
  const safeProject = escapeHtml(projectName);
  const safeClient = escapeHtml(clientName);
  const safeOrg = escapeHtml(orgName);
  const safeNote = note ? escapeHtml(note) : null;
  const isApproved = action === "APPROVED";

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">
      Response received: ${isApproved ? "Approved" : "Rejected"}
    </h2>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Hi ${safeClient}, thank you for reviewing the proposal from <strong>${safeOrg}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 4px">Project</p>
      <p style="color:#1d4ed8;font-size:16px;font-weight:700;margin:0">${safeProject}</p>
      <p style="color:#475569;font-size:14px;margin:10px 0 0">
        Your response: <strong style="color:${isApproved ? "#16a34a" : "#dc2626"}">${isApproved ? "Approved" : "Rejected"}</strong>
      </p>
      ${safeNote ? `<p style="color:#475569;font-size:14px;margin:8px 0 0"><strong>Your note:</strong> ${safeNote}</p>` : ""}
    </div>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      The project team at <strong>${safeOrg}</strong> has been notified of your response and will be in touch with next steps.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      This is a confirmation of your response. You don&apos;t need to do anything else.
    </p>
  `);
}

export function welcomeEmailHtml(name: string, dashboardUrl: string, trialEndsAt?: Date | null, unsubscribeUrl?: string): string {
  const safeName = escapeHtml(firstName(name));
  const trialLine = trialEndsAt
    ? `Your free trial runs until <strong>${trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>. No credit card required.`
    : `You have <strong>14 days</strong> to explore everything for free. No credit card required.`;
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Welcome to Estimate Nepal!</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your email is verified and your 14-day free trial has started. Here&apos;s how to get the most out of it:
    </p>
    ${trialEndsAt ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 20px;margin:0 0 20px;text-align:center">
      <p style="color:#1e40af;font-size:15px;font-weight:600;margin:0">
        Trial expires: <strong>${trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>
      </p>
    </div>` : ""}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #dbeafe">
              <span style="color:#1d4ed8;font-weight:700;font-size:15px">1.</span>
              <span style="color:#1e40af;font-size:14px;padding-left:8px">Create your first project</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #dbeafe">
              <span style="color:#1d4ed8;font-weight:700;font-size:15px">2.</span>
              <span style="color:#1e40af;font-size:14px;padding-left:8px">Upload a drawing and set the scale</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0">
              <span style="color:#1d4ed8;font-weight:700;font-size:15px">3.</span>
              <span style="color:#1e40af;font-size:14px;padding-left:8px">Measure quantities and export your BOQ</span>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      Need help getting started? Reply to this email or write to ${supportLinkBlue}. We usually respond within a few hours.
    </p>
    ${ctaButton(dashboardUrl, "Go to Dashboard →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      ${trialLine}
    </p>
  `, unsubscribeUrl);
}

// Generic reengagement 7 (no churn reason known)
function re7Generic(safeName: string, upgradeUrl: string, price?: string): string {
  return `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Your Estimate Nepal projects are still here</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      It has been a week since your trial ended.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Everything you built is still safe. Your projects, your drawings, your measurements, your BOQs.
      All of it is waiting exactly where you left it.
    </p>
    <p style="color:#334155;font-size:15px;margin:0 0 4px">
      Plans start from <strong>${planPrice(price)}</strong>. No long-term commitment.
    </p>
    ${ctaButton(upgradeUrl, "Resume Your Project →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Not sure yet? Reply to this email or write to ${supportLink} and let us talk.
      We have helped other contractors find a plan that fits their budget.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:12px 0 0">
      P.S. If pricing was the issue, just say so. We may have options.
    </p>`;
}

// Personalized reengagement 7 — too expensive
function re7TooExpensive(safeName: string, upgradeUrl: string): string {
  return `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">About the pricing concern you raised</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      You told us pricing was the issue when your trial ended.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      We hear that. Construction margins in Nepal are tight and we know every rupee matters.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      The annual plan works out to significantly less per month. If even that does not fit right now, reply to this email or write to
      ${supportLinkBlue}. We have helped other small firms find a way to make it work.
    </p>
    ${ctaButton(upgradeUrl, "See Pricing Options →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your projects and data are still here. Nothing is lost.
    </p>`;
}

// Personalized reengagement 7 — missing features
function re7MissingFeatures(safeName: string, upgradeUrl: string): string {
  return `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">The feature you needed</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      You told us a feature was missing when your trial ended.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      We are a small team building specifically for Nepal&apos;s construction industry. We cannot build everything at once.
      But the things our users tell us they need most do get built.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      Reply to this email or write to ${supportLinkBlue} and tell us what was missing.
      We will tell you honestly whether it is coming and when.
    </p>
    ${ctaButton(upgradeUrl, "Resume Your Project →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your data is still here whenever you are ready.
    </p>`;
}

// Personalized reengagement 7 — just exploring
function re7JustExploring(safeName: string, upgradeUrl: string): string {
  return `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">No pressure — your projects are still here</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      You mentioned you were exploring when you signed up. That is completely fine.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      When you have a real project coming up and need professional BOQs, measurements, and estimates fast,
      Estimate Nepal will be here. Everything you built during the trial is waiting.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      No commitment required. Start a plan when the work calls for it.
    </p>
    ${ctaButton(upgradeUrl, "Resume Your Project →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Questions? Write to ${supportLink}. We are happy to walk you through it when the time is right.
    </p>`;
}

// Personalized reengagement 7 — switched to competitor
function re7Competitor(safeName: string, upgradeUrl: string): string {
  return `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">We heard you went elsewhere</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Completely fair. We want you to use the best tool for your work.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      What sets us apart is that Estimate Nepal is built specifically for Nepal — Nepal standard rates,
      Nepal drawing formats, government BOQ export, and a team that understands local construction workflows.
      Most alternatives are adapted from India or the West and require workarounds.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      If the other tool is not working out, or if you want to run a side-by-side comparison on a real project,
      reply to this email or write to ${supportLinkBlue}. We will help.
    </p>
    ${ctaButton(upgradeUrl, "Resume Your Project →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your trial data is still here. No need to start over.
    </p>`;
}

export function trialReengagement7EmailHtml(
  name: string,
  upgradeUrl: string,
  unsubscribeUrl?: string,
  price?: string,
  churnReason?: string,
): string {
  const safeName = escapeHtml(firstName(name));
  let content: string;
  if (churnReason === "too_expensive") {
    content = re7TooExpensive(safeName, upgradeUrl);
  } else if (churnReason === "missing_features") {
    content = re7MissingFeatures(safeName, upgradeUrl);
  } else if (churnReason === "just_exploring") {
    content = re7JustExploring(safeName, upgradeUrl);
  } else if (churnReason === "competitor") {
    content = re7Competitor(safeName, upgradeUrl);
  } else {
    content = re7Generic(safeName, upgradeUrl, price);
  }
  return wrapEmailHtml(content, unsubscribeUrl);
}

export function trialReengagement14EmailHtml(
  name: string,
  upgradeUrl: string,
  unsubscribeUrl?: string,
  price?: string,
  churnReason?: string,
): string {
  const safeName = escapeHtml(firstName(name));

  // Personalized heading and extra note for known churn reasons
  const heading = churnReason === "too_expensive"
    ? "Still thinking about pricing?"
    : churnReason === "missing_features"
    ? "An update on the feature you mentioned"
    : "Two weeks. Your data is still safe.";

  const reasonNote = churnReason === "too_expensive"
    ? `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
        If pricing is still the sticking point, write to ${supportLinkBlue} before upgrading.
        There may be options we have not discussed yet.
      </p>`
    : churnReason === "missing_features"
    ? `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
        We are actively building based on what our users tell us. If you wrote to us about what was missing,
        we likely have an update or a workaround. Reply to this email or write to ${supportLinkBlue}.
      </p>`
    : "";

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">${heading}</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Two weeks since your trial ended.
    </p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your projects, drawings, measurements, and BOQs are still here. Nothing has been deleted.
      Upgrade at any time and continue exactly where you stopped.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#15803d;font-size:14px;font-weight:600;margin:0 0 4px">Your work is safe</p>
      <p style="color:#166534;font-size:14px;margin:0">Upgrade at any time and continue working. Nothing is lost.</p>
    </div>
    ${reasonNote}
    <p style="color:#334155;font-size:15px;margin:0 0 4px">Plans from <strong>${planPrice(price)}</strong>. No long-term commitment.</p>
    ${ctaButton(upgradeUrl, "Continue Where You Left Off →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      If there is a reason you have not come back that you have not told us, reply to this email or write to
      ${supportLink}. We read every message.
    </p>
  `, unsubscribeUrl);
}

export function trialReengagement21EmailHtml(name: string, upgradeUrl: string, unsubscribeUrl?: string, deletionDate?: string): string {
  const safeName = escapeHtml(firstName(name));
  const removalDate = escapeHtml(deletionDate ?? "9 days");
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Last chance to keep your data</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your trial ended 3 weeks ago. We will be removing inactive trial data on <strong>${removalDate}</strong>.
      Upgrade now to keep your projects, drawings, and measurements permanently.
    </p>
    <div style="background:#fef9f0;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#92400e;font-size:14px;font-weight:600;margin:0 0 4px">Data removal on ${removalDate}</p>
      <p style="color:#78350f;font-size:14px;margin:0">Upgrade before this date to preserve all your work permanently.</p>
    </div>
    ${ctaButton(upgradeUrl, "Upgrade and Keep My Data →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your account will remain active. Only project data is removed. Questions? Write to ${supportLink}.
    </p>
  `, unsubscribeUrl);
}

export function trialDataWarningEmailHtml(name: string, upgradeUrl: string, unsubscribeUrl?: string, deletionDate?: string): string {
  const safeName = escapeHtml(firstName(name));
  const deleteOn = escapeHtml(deletionDate ?? "tomorrow");
  return wrapEmailHtml(`
    <h2 style="color:#dc2626;font-size:22px;font-weight:700;margin:0 0 8px">Your data will be deleted on ${deleteOn}</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      This is your final notice. Your Estimate Nepal trial data, including all projects, drawings, measurements, and BOQs,
      will be permanently deleted on <strong>${deleteOn}</strong>.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#991b1b;font-size:14px;font-weight:600;margin:0 0 8px">Will be deleted on ${deleteOn}:</p>
      <ul style="color:#7f1d1d;font-size:14px;margin:0;padding-left:20px;line-height:1.8">
        <li>All projects and drawings</li>
        <li>All takeoff measurements</li>
        <li>All BOQs and rate analyses</li>
      </ul>
    </div>
    <p style="color:#334155;font-size:15px;font-weight:600;margin:0 0 4px">Upgrade now to save everything permanently.</p>
    ${ctaButton(upgradeUrl, "Upgrade Now and Save My Data →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your login account will remain active. Only project data will be removed.
      Need help immediately? Write to ${supportLink}.
    </p>
  `, unsubscribeUrl);
}

export function trialDataWipedEmailHtml(name: string, baseUrl?: string, unsubscribeUrl?: string): string {
  const safeName = escapeHtml(firstName(name));
  const siteUrl = baseUrl ?? process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Your trial data has been removed</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      As notified, your Estimate Nepal trial data has been permanently deleted. Your login account remains active.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0">
        If you ever decide to come back, you can upgrade at any time and start fresh with a new project.
        Your account and login credentials are preserved.
      </p>
    </div>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      If there is anything we could have done better, please write to
      ${supportLinkBlue}. Your feedback helps us build a better product.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      You can still log in at <a href="${siteUrl}" style="color:#94a3b8">${siteUrl}</a>.
    </p>
  `, unsubscribeUrl);
}

export function trialExpiredEmailHtml(name: string, upgradeUrl: string, unsubscribeUrl?: string, price?: string): string {
  const safeName = escapeHtml(firstName(name));

  return wrapEmailHtml(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Your trial has ended</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your Estimate Nepal free trial has ended. Your account is currently on a limited plan and you&apos;re unable to create new exports, upload drawings, or edit projects.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#15803d;font-size:14px;font-weight:600;margin:0 0 4px">Your data is safe</p>
      <p style="color:#166534;font-size:14px;margin:0">
        All your projects, drawings, measurements, and BOQs are preserved and waiting for you. Upgrade now to pick up exactly where you left off.
      </p>
    </div>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 4px">
      Plans start from <strong>${planPrice(price)}</strong>. No long-term commitment required.
    </p>
    ${ctaButton(upgradeUrl, "Upgrade Now →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Questions about plans or pricing? Reply to this email or write to ${supportLink}. We&apos;re happy to help.
    </p>
  `, unsubscribeUrl);
}
