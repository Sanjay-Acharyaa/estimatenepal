export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { getTemplates, TEMPLATE_TYPES } from "@/lib/email-templates";

const BODY_SIZE_LIMIT = 50_000; // L3: 50 KB cap on template body

// GET /api/admin/emails/templates — all templates (DB merged with defaults)
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const templates = await getTemplates();
    return NextResponse.json(templates);
  } catch (err) {
    return handleApiError(err);
  }
}

// PUT /api/admin/emails/templates — upsert a template
// Body: { emailType, subject, bodyHtml }
export async function PUT(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const body = await req.json();
    const { emailType, subject, bodyHtml } = body as {
      emailType: string;
      subject: string;
      bodyHtml: string;
    };

    if (!emailType || !subject || !bodyHtml) {
      return NextResponse.json({ error: "emailType, subject, and bodyHtml are required." }, { status: 400 });
    }
    if (!TEMPLATE_TYPES.includes(emailType as never)) {
      return NextResponse.json({ error: "Unknown emailType." }, { status: 400 });
    }
    // L3: Reject oversized bodies before they reach the DB
    if (bodyHtml.length > BODY_SIZE_LIMIT) {
      return NextResponse.json(
        { error: `Body exceeds ${BODY_SIZE_LIMIT.toLocaleString()} character limit (${bodyHtml.length.toLocaleString()} chars).` },
        { status: 413 }
      );
    }

    const savedBy = token.email as string;
    const savedAt = new Date();

    // Upsert the template AND create a version snapshot atomically
    const [template] = await prisma.$transaction([
      prisma.emailTemplate.upsert({
        where: { emailType },
        update: { subject, bodyHtml, updatedBy: savedBy, updatedAt: savedAt },
        create: { emailType, subject, bodyHtml, updatedBy: savedBy },
      }),
      prisma.emailTemplateVersion.create({
        data: { emailType, subject, bodyHtml, savedBy, savedAt },
      }),
    ]);

    // H3: Prune old versions — keep the 20 most recent per emailType to bound table growth.
    // Must run after the transaction so the new version is already written.
    const keepIds = (
      await prisma.emailTemplateVersion.findMany({
        where: { emailType },
        orderBy: { savedAt: "desc" },
        take: 20,
        select: { id: true },
      })
    ).map((v) => v.id);
    await prisma.emailTemplateVersion.deleteMany({
      where: { emailType, id: { notIn: keepIds } },
    });

    // M8: Template saves are versioned (EmailTemplateVersion) so history is already the audit trail.
    // Log to stdout for server-level observability (visible in PM2 logs).
    console.log("[emails/templates] saved", { emailType, savedBy, savedAt: savedAt.toISOString() });

    return NextResponse.json(template);
  } catch (err) {
    return handleApiError(err);
  }
}
