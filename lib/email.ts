import { Resend } from "resend";

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

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "noreply@estimatenepal.com",
    to,
    subject,
    html,
  });
}

// Shared building icon SVG (inline, email-safe)
const LOGO_ICON = `<svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle">
  <rect width="40" height="40" rx="10" fill="#1d4ed8"/>
  <rect x="7" y="22" width="6" height="13" rx="1" fill="white" opacity="0.9"/>
  <rect x="17" y="15" width="6" height="20" rx="1" fill="white"/>
  <rect x="27" y="19" width="6" height="16" rx="1" fill="white" opacity="0.85"/>
  <rect x="5" y="36" width="30" height="1.5" rx="0.75" fill="white" opacity="0.45"/>
</svg>`;

function emailBase(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Estimate Nepal</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px">
  <tr><td align="center">
    <table width="100%" style="max-width:560px">

      <!-- Header -->
      <tr><td style="background:#1d4ed8;border-radius:12px 12px 0 0;padding:24px 32px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle">${LOGO_ICON}</td>
          <td style="vertical-align:middle;padding-left:10px">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">
              Estimate<span style="color:#93c5fd"> Nepal</span>
            </span>
          </td>
        </tr></table>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:36px 32px">
        ${content}
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 0;text-align:center">
        <p style="color:#94a3b8;font-size:12px;margin:0">
          &copy; 2026 Estimate Nepal &mdash; estimatenepal.com<br/>
          <span style="color:#cbd5e1">Nepal&apos;s Smart Construction Platform</span>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:28px 0">
    <tr><td style="background:#1d4ed8;border-radius:8px">
      <a href="${safeUrl(url)}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px">${label}</a>
    </td></tr>
  </table>`;
}

export function verificationEmailHtml(url: string, name: string) {
  const safeName = escapeHtml(name);
  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Verify your email address</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 8px">
      Welcome to Estimate Nepal! Click the button below to verify your email address and activate your workspace.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 4px">This link expires in <strong>24 hours</strong>.</p>
    ${ctaButton(url, "Verify Email Address →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      If you didn&apos;t create a Estimate Nepal account, you can safely ignore this email.
    </p>
  `);
}

export function inviteEmailHtml(inviteUrl: string, orgName: string, inviterName: string, role: string) {
  const safeOrgName = escapeHtml(orgName);
  const safeInviterName = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  return emailBase(`
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
  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 20px">Project Proposal Shared</h2>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      <strong>${safeSenderName}</strong> from <strong>${safeOrgName}</strong> has shared a project proposal with you.
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#1e40af;font-size:14px;font-weight:600;margin:0 0 4px">Project</p>
      <p style="color:#1d4ed8;font-size:17px;font-weight:700;margin:0">${safeProjectName}</p>
    </div>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 4px">
      Review the proposal and let them know your response — you can approve or reject directly from the link below.
    </p>
    ${ctaButton(shareUrl, "Review Proposal →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      This link is unique to you. If you weren&apos;t expecting this, you can safely ignore this email.
    </p>
  `);
}

export function passwordResetEmailHtml(url: string) {
  return emailBase(`
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
  upgradeUrl: string
): string {
  const safeName = escapeHtml(name);
  // Format date as "15 July 2026" — readable, unambiguous for a Nepali audience
  const expiryDateStr = trialEndsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Your trial ends in 3 days</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your Estimate Nepal free trial expires on <strong>${expiryDateStr}</strong>. After that, you&apos;ll lose access to creating new exports, uploading drawings, and editing projects.
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
      Your projects, drawings, and data will <strong>remain safe</strong> — you just need to upgrade to keep working.
    </p>
    ${ctaButton(upgradeUrl, "View Plans →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Plans start from NPR 999/month for a single user. Annual billing saves you 2 months free.
      If you have any questions, reply to this email and we&apos;ll help you find the right plan.
    </p>
  `);
}

export function trialDay7EmailHtml(name: string, dashboardUrl: string): string {
  const safeName = escapeHtml(name);
  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">How's your first week going?</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      You're 7 days into your Estimate Nepal trial — great time to check in. Have you had a chance to explore everything yet?
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
      Reply to this email if you need help getting set up — we respond within a few hours.
    </p>
    ${ctaButton(dashboardUrl, "Continue in Dashboard →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      You have 7 days remaining on your free trial.
    </p>
  `);
}

export function trialDay12EmailHtml(name: string, upgradeUrl: string, trialEndsAt: Date): string {
  const safeName = escapeHtml(name);
  const expiryDateStr = trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return emailBase(`
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
      Plans from <strong>NPR 999/month</strong>. Upgrade now and keep working without interruption.
    </p>
    ${ctaButton(upgradeUrl, "Upgrade Now — Keep Access →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Questions about pricing? Reply to this email — we&apos;re happy to help find the right plan.
    </p>
  `);
}

export function churnReasonEmailHtml(name: string, reasons: { label: string; url: string }[]): string {
  const safeName = escapeHtml(name);
  const reasonButtons = reasons.map(r =>
    `<tr><td style="padding:6px 0">
      <a href="${safeUrl(r.url)}" style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;color:#334155;text-decoration:none;font-size:14px;font-weight:500;text-align:center">
        ${escapeHtml(r.label)}
      </a>
    </td></tr>`
  ).join("");

  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">One quick question</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px">
      Your Estimate Nepal trial has ended. We&apos;d love to know what stopped you — it takes one click and helps us improve the product.
    </p>
    <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px">Why didn&apos;t you continue?</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${reasonButtons}
    </table>
    <p style="color:#94a3b8;font-size:13px;margin:28px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Changed your mind? Your data is still safe — reply to this email and we&apos;ll help you get back in.
    </p>
  `);
}

export function npsEmailHtml(name: string, scores: { score: number; url: string }[]): string {
  const safeName = escapeHtml(name);
  const scoreButtons = scores.map(s =>
    `<td style="padding:2px"><a href="${safeUrl(s.url)}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;text-decoration:none;font-size:13px;font-weight:600">${s.score}</a></td>`
  ).join("");

  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">How likely are you to recommend us?</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px">
      You&apos;ve been using Estimate Nepal for a week — how&apos;s it going? On a scale of 0–10, how likely are you to recommend us to a colleague?
    </p>
    <div style="margin:0 0 8px">
      <table cellpadding="0" cellspacing="0"><tr>${scoreButtons}</tr></table>
    </div>
    <div style="display:flex;justify-content:space-between;margin:4px 0 24px">
      <span style="color:#94a3b8;font-size:11px">0 = Not at all</span>
      <span style="color:#94a3b8;font-size:11px">10 = Definitely</span>
    </div>
    <p style="color:#94a3b8;font-size:13px;margin:0;padding-top:24px;border-top:1px solid #f1f5f9">
      This takes 1 click and helps us improve. Thank you for your time.
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

  return emailBase(`
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

  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">
      Response received — ${isApproved ? "Approved" : "Rejected"}
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

export function welcomeEmailHtml(name: string, dashboardUrl: string): string {
  const safeName = escapeHtml(name);
  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Welcome to Estimate Nepal!</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px">
      Your email is verified and your 14-day free trial has started. Here&apos;s how to get the most out of it:
    </p>
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
      Need help getting started? Just reply to this email — we respond within a few hours.
    </p>
    ${ctaButton(dashboardUrl, "Go to Dashboard →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      You have <strong>14 days</strong> to explore everything for free. No credit card required.
    </p>
  `);
}

export function trialReengagement7EmailHtml(name: string, upgradeUrl: string): string {
  const safeName = escapeHtml(name);
  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">We miss you at Estimate Nepal</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your trial ended a week ago. Your projects and all your work are still safe — you just need to upgrade to get back in.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0">
        Estimate Nepal helps construction professionals generate accurate BOQs in a fraction of the time —
        with PDF takeoff measurements, rate analysis, and one-click tender document export.
      </p>
    </div>
    <p style="color:#334155;font-size:15px;margin:0 0 4px">
      Plans start from <strong>NPR 999/month</strong>. Upgrade now and pick up exactly where you left off.
    </p>
    ${ctaButton(upgradeUrl, "Upgrade Now →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Questions? Reply to this email and we&apos;ll help you find the right plan.
    </p>
  `);
}

export function trialReengagement14EmailHtml(name: string, upgradeUrl: string): string {
  const safeName = escapeHtml(name);
  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Your data is still waiting for you</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      It&apos;s been two weeks since your trial ended. Everything you built — your projects, drawings, measurements, and BOQs — is still intact and ready when you are.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#15803d;font-size:14px;font-weight:600;margin:0 0 4px">Your work is safe</p>
      <p style="color:#166534;font-size:14px;margin:0">
        Upgrade at any time and continue working — nothing is lost.
      </p>
    </div>
    <p style="color:#334155;font-size:15px;margin:0 0 4px">
      Plans from <strong>NPR 999/month</strong>. No long-term commitment.
    </p>
    ${ctaButton(upgradeUrl, "Come Back →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Need help or have concerns about pricing? Reply to this email — we&apos;re happy to talk.
    </p>
  `);
}

export function trialReengagement21EmailHtml(name: string, upgradeUrl: string): string {
  const safeName = escapeHtml(name);
  return emailBase(`
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px">Last chance to keep your data</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your trial ended 3 weeks ago. We&apos;ll be removing inactive trial data in <strong>9 days</strong> —
      upgrade now to keep your projects, drawings, and measurements permanently.
    </p>
    <div style="background:#fef9f0;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#92400e;font-size:14px;font-weight:600;margin:0 0 4px">Data removal in 9 days</p>
      <p style="color:#78350f;font-size:14px;margin:0">
        Upgrade before day 30 to preserve all your work permanently.
      </p>
    </div>
    ${ctaButton(upgradeUrl, "Upgrade and Keep My Data →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your account will remain active — only project data is removed. Reply to this email if you have questions.
    </p>
  `);
}

export function trialDataWarningEmailHtml(name: string, upgradeUrl: string): string {
  const safeName = escapeHtml(name);
  return emailBase(`
    <h2 style="color:#dc2626;font-size:22px;font-weight:700;margin:0 0 8px">Your data will be deleted in 24 hours</h2>
    <p style="color:#64748b;font-size:15px;margin:0 0 20px">Hi ${safeName},</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px">
      This is your final notice. Your Estimate Nepal trial data — including all projects, drawings, measurements, and BOQs —
      will be permanently deleted in <strong>24 hours</strong>.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="color:#991b1b;font-size:14px;font-weight:600;margin:0 0 8px">Will be deleted tomorrow:</p>
      <ul style="color:#7f1d1d;font-size:14px;margin:0;padding-left:20px;line-height:1.8">
        <li>All projects and drawings</li>
        <li>All takeoff measurements</li>
        <li>All BOQs and rate analyses</li>
      </ul>
    </div>
    <p style="color:#334155;font-size:15px;font-weight:600;margin:0 0 4px">
      Upgrade now to save everything permanently.
    </p>
    ${ctaButton(upgradeUrl, "Upgrade Now — Save My Data →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Your login account will remain active. Only project data will be removed.
      Reply to this email immediately if you need help.
    </p>
  `);
}

export function trialDataWipedEmailHtml(name: string): string {
  const safeName = escapeHtml(name);
  return emailBase(`
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
      We&apos;re sorry to see you go. If there&apos;s anything we could have done better,
      please reply to this email — your feedback helps us improve.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      &copy; 2026 Estimate Nepal. You can still log in at estimatenepal.com.
    </p>
  `);
}

export function trialExpiredEmailHtml(name: string, upgradeUrl: string): string {
  const safeName = escapeHtml(name);

  return emailBase(`
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
      Plans start from <strong>NPR 999/month</strong> — no long-term commitment required.
    </p>
    ${ctaButton(upgradeUrl, "Upgrade Now →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      Need help choosing a plan or have questions about pricing? Reply to this email or WhatsApp us — we&apos;re happy to help.
    </p>
  `);
}
