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
<title>NepaliEstimate</title>
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
              Nepali<span style="color:#93c5fd">Estimate</span>
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
          &copy; 2026 NepaliEstimate &mdash; estimatenepal.com<br/>
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
      Welcome to NepaliEstimate! Click the button below to verify your email address and activate your workspace.
    </p>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 4px">This link expires in <strong>24 hours</strong>.</p>
    ${ctaButton(url, "Verify Email Address →")}
    <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;padding-top:24px;border-top:1px solid #f1f5f9">
      If you didn&apos;t create a NepaliEstimate account, you can safely ignore this email.
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
      <strong>${safeInviterName}</strong> has invited you to join <strong>${safeOrgName}</strong> on NepaliEstimate as a <strong>${safeRole}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 8px">
      <p style="color:#475569;font-size:14px;margin:0">
        NepaliEstimate is Nepal&apos;s smart construction platform for BOQ generation, tendering, and project management.
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
      We received a request to reset the password for your NepaliEstimate account.
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
