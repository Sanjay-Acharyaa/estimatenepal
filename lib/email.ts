import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  ignoreTLS: process.env.NODE_ENV !== "production",
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "noreply@nepaliestimate.com",
    to,
    subject,
    html,
  });
}

export function verificationEmailHtml(url: string, name: string) {
  return `
    <div style="font-family:sans-serif;max-width:500px;margin:auto">
      <h2>Verify your NepaliEstimate account</h2>
      <p>Hi ${name},</p>
      <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Verify Email</a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">If you didn't create an account, ignore this email.</p>
    </div>
  `;
}

export function inviteEmailHtml(inviteUrl: string, orgName: string, inviterName: string, role: string) {
  return `
    <div style="font-family:sans-serif;max-width:500px;margin:auto">
      <h2>You've been invited to NepaliEstimate</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> as a <strong>${role}</strong>.</p>
      <p>Click the button below to accept. This invitation expires in 72 hours.</p>
      <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Accept Invitation</a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">If you weren't expecting this invitation, you can safely ignore this email.</p>
    </div>
  `;
}

export function passwordResetEmailHtml(url: string) {
  return `
    <div style="font-family:sans-serif;max-width:500px;margin:auto">
      <h2>Reset your password</h2>
      <p>Click the button below to set a new password. This link expires in 1 hour.</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Reset Password</a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">If you didn't request this, ignore this email.</p>
    </div>
  `;
}
