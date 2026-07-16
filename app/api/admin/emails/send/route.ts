import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { logEmail } from "@/lib/email-log";
import { getTemplates, renderTemplate, TEMPLATE_TYPES, TemplateType } from "@/lib/email-templates";

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";

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

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        name: true,
        email: true,
        orgId: true,
        emailUnsubscribedAt: true,             // H3: check opt-out
        org: { select: { id: true, trialEndsAt: true } },
      },
    });
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

    const html = renderTemplate(tpl.bodyHtml, {
      name:         user.name,
      dashboardUrl: `${BASE_URL}/dashboard`,
      upgradeUrl:   `${BASE_URL}/pricing`,
      baseUrl:      BASE_URL,
      trialEndsAt:  trialEndsAtStr,
      reasonButtons: `<p style="color:#94a3b8;text-align:center;font-size:13px">[Reason buttons — admin manual send]</p>`,
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
