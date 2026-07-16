import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { TEMPLATE_TYPES } from "@/lib/email-template-constants";

// GET /api/admin/emails/templates/versions?emailType=xxx
// Returns the last 10 saved versions for a given email template type.
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const emailType = req.nextUrl.searchParams.get("emailType");
    if (!emailType || !TEMPLATE_TYPES.includes(emailType as never)) {
      return NextResponse.json({ error: "Invalid or missing emailType." }, { status: 400 });
    }

    const versions = await prisma.emailTemplateVersion.findMany({
      where: { emailType },
      orderBy: { savedAt: "desc" },
      take: 10,
      select: { id: true, emailType: true, subject: true, bodyHtml: true, savedAt: true, savedBy: true },
    });

    return NextResponse.json(versions);
  } catch (err) {
    return handleApiError(err);
  }
}
