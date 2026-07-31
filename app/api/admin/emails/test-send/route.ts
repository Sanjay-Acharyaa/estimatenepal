export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { wrapEmailHtml } from "@/lib/email-template-constants";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { TEMPLATE_TYPES } from "@/lib/email-template-constants";
import { getConfig } from "@/lib/config";

// POST /api/admin/emails/test-send
// Sends a test email using the current editor body to the calling admin's own address.
// Body: { emailType, subject, bodyHtml }
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const body = await req.json();
    const { emailType, subject, bodyHtml } = body as {
      emailType?: string;
      subject?: string;
      bodyHtml?: string;
    };

    if (!emailType || !subject || !bodyHtml) {
      return NextResponse.json({ error: "emailType, subject, and bodyHtml are required." }, { status: 400 });
    }
    if (!TEMPLATE_TYPES.includes(emailType as never)) {
      return NextResponse.json({ error: "Unknown emailType." }, { status: 400 });
    }

    const adminEmail = token.email as string;
    if (!adminEmail) {
      return NextResponse.json({ error: "Could not determine admin email from session." }, { status: 400 });
    }

    const BASE_URL = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
    const price = await getConfig("price_solo_monthly");

    const sampleReasons = [
      "Too expensive", "Missing features I need", "Just exploring / not ready yet",
      "Went with a competitor", "Too complex / hard to use", "Not relevant to my work",
    ];

    // Substitute obvious placeholders with sample values so the preview looks real
    const sample: Record<string, string> = {
      "{{name}}": "Test Admin",
      "{{dashboardUrl}}": `${BASE_URL}/dashboard`,
      "{{upgradeUrl}}": `${BASE_URL}/pricing`,
      "{{baseUrl}}": BASE_URL,
      "{{price}}": price,
      "{{annualFreeMonths}}": "2",
      "{{feedbackUrl}}": "#",
      "{{trialEndsAt}}": new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      "{{deletionDate}}": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      "{{reasonButtons}}": `<table width="100%" cellpadding="0" cellspacing="0">
        ${sampleReasons.map(r => `<tr><td style="padding:5px 0"><a href="#" style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;color:#334155;text-decoration:none;font-size:14px;font-weight:500;text-align:center">${r}</a></td></tr>`).join("")}
        <tr><td style="padding:5px 0"><a href="#" style="display:block;background:#ffffff;border:1px dashed #cbd5e1;border-radius:8px;padding:12px 20px;color:#64748b;text-decoration:none;font-size:14px;font-weight:500;text-align:center">Something else: tell us in your own words...</a></td></tr>
      </table>`,
      "{{scoreButtons}}": `<table cellpadding="0" cellspacing="0" style="margin:0 0 4px"><tr>
        ${Array.from({ length: 11 }, (_, i) => `<td style="padding:2px"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;text-decoration:none;font-size:13px;font-weight:600">${i}</a></td>`).join("")}
      </tr></table>`,
    };

    let populated = bodyHtml;
    for (const [key, value] of Object.entries(sample)) {
      populated = populated.replaceAll(key, value);
    }

    const testSubject = `[TEST] ${subject}`;
    const html = wrapEmailHtml(populated);

    await sendEmail({ to: adminEmail, subject: testSubject, html });

    return NextResponse.json({ sent: true, to: adminEmail });
  } catch (err) {
    return handleApiError(err);
  }
}
