import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { sendEmail, proposalEmailHtml } from "@/lib/email";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const schema = z.object({
  to: z.string().email(),
  linkId: z.string().min(1),
});

// POST /api/projects/[id]/share-links/send — email a share link to a client
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id }, include: { org: { select: { name: true } } } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const link = await prisma.shareLink.findFirst({ where: { id: parsed.data.linkId, projectId: params.id } });
    if (!link) throw notFound("Share link");

    const shareUrl = `${process.env.NEXTAUTH_URL}/share/${link.token}`;

    await sendEmail({
      to: parsed.data.to,
      subject: `Project Proposal: ${project.name}`,
      html: proposalEmailHtml(shareUrl, project.name, project.org?.name ?? "Estimate Nepal", caller.name),
    });

    // Save client email on the link
    await prisma.shareLink.update({ where: { id: link.id }, data: { clientEmail: parsed.data.to } });

    return NextResponse.json({ message: "Proposal sent." });
  } catch (err) {
    return handleApiError(err);
  }
}
