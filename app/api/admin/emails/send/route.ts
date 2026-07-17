export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { logEmail } from "@/lib/email-log";
import { getTemplates, renderTemplate, TEMPLATE_TYPES, TemplateType } from "@/lib/email-templates";
import { getConfig } from "@/lib/config";

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";

function churnKey(orgId: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(orgId).digest("hex").slice(0, 20);
}

const CHURN_REASONS = [
  { label: "Too expensive",                  reason: "too_expensive" },
  { label: "Missing features I need",        reason: "missing_features" },
  { label: "Just exploring / not ready yet", reason: "just_exploring" },
  { label: "Went with a competitor",         reason: "competitor" },
  { label: "Too complex / hard to use",      reason: "too_complex" },
  { label: "Not relevant to my work",        reason: "not_relevant" },
];

function buildReasonButtonsHtml(orgId: string): string {
  const key = churnKey(orgId);
  const rows = CHURN_REASONS.map(r =>
    `<tr><td style="padding:5px 0"><a href="${BASE_URL}/api/feedback/churn?reason=${r.reason}&org=${orgId}&key=${key}" style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;color:#334155;text-decoration:none;font-size:14px;font-weight:500;text-align:center">${r.label}</a></td></tr>`
  ).join("");
  const feedbackUrl = `${BASE_URL}/feedback/churn-text?org=${orgId}&key=${key}`;
  const elseRow = `<tr><td style="padding:5px 0"><a href="${feedbackUrl}" style="display:block;background:#ffffff;border:1px dashed #cbd5e1;border-radius:8px;padding:12px 20px;color:#64748b;text-decoration:none;font-size:14px;font-weight:500;text-align:center">Something else: tell us in your own words...</a></td></tr>`;
  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}${elseRow}</table>`;
}

// POST /api/admin/emails/send — manually send a lifecycle email to a user
// Body: { userEmail, emailType }
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const body = await req.json();
    const { userEmail, emailType } = body as { userEmail: string; emailType: string };

    if (!userEmail || !emailType) {
      return NextResponse.json({ error: "userEmail and emailType are required." }, { status: 400 });
    }
    if (!TEMPLATE_TYPES.includes(emailType as TemplateType)) {
      return NextResponse.json({ error: "Unknown emailType." }, { status: 400 });
    }

    const [user, price] = await Promise.all([
      prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          name: true,
          email: true,
          orgId: true,
          emailUnsubscribedAt: true,
          org: { select: { id: true, trialEndsAt: true } },
        },
      }),
      getConfig("price_solo_monthly"),
    ]);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

    // H3: Respect opt-out. Admin must be aware before sending to unsubscribed users.
    if (user.emailUnsubscribedAt) {
      return NextResponse.json(
        { error: `This user unsubscribed on ${user.emailUnsubscribedAt.toLocaleDateString("en-GB")}. Remove the restriction first if you intend to override.` },
        { status: 400 }
      );
    }

    const templates = await getTemplates();
    const tpl = templates.find((t) => t.emailType === emailType);
    if (!tpl) return NextResponse.json({ error: "Template not found." }, { status: 404 });

    const trialEndsAt = user.org?.trialEndsAt;
    const trialEndsAtStr = trialEndsAt
      ? trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "";

    const orgIdForButtons = user.org?.id ?? user.orgId ?? "unknown";
    const feedbackUrl = `${BASE_URL}/feedback/churn-text?org=${orgIdForButtons}&key=${churnKey(orgIdForButtons)}`;

    const html = renderTemplate(tpl.bodyHtml, {
      name:          user.name,
      dashboardUrl:  `${BASE_URL}/dashboard`,
      upgradeUrl:    `${BASE_URL}/pricing`,
      baseUrl:       BASE_URL,
      trialEndsAt:   trialEndsAtStr,
      price,
      annualFreeMonths: "2",
      feedbackUrl,
      reasonButtons: buildReasonButtonsHtml(orgIdForButtons),
      scoreButtons:  `<p style="color:#94a3b8;text-align:center;font-size:13px">[NPS score buttons — admin manual send]</p>`,
    });

    let resendEmailId: string | null = null;
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | undefined;
    try {
      resendEmailId = await sendEmail({ to: user.email, subject: tpl.subject, html });
    } catch (err) {
      status = "failed";
      errorMessage = (err as Error).message;
    }

    await logEmail({
      orgId:         user.orgId,
      recipientEmail: user.email,
      recipientName:  user.name,
      emailType,
      subject:       tpl.subject,
      status,
      errorMessage,
      resendEmailId,
    });

    // H6: Audit trail — record which admin sent what to whom.
    if (status === "sent") {
      prisma.auditLog.create({
        data: {
          orgId:      user.orgId ?? "",
          userId:     token.sub as string,
          event:      "admin_email_send",
          resourceId: emailType,
          meta:       { to: user.email, subject: tpl.subject },
          ipAddress:  ip,
        },
      }).catch((err: Error) => console.error("[admin/emails/send] AuditLog failed:", err.message));
    }

    if (status === "failed") {
      return NextResponse.json({ error: errorMessage ?? "Email send failed." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sentTo: user.email });
  } catch (err) {
    return handleApiError(err);
  }
}
