import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { sendEmail, proposalResponseAdminEmailHtml, proposalResponseClientEmailHtml } from "@/lib/email";

const approveSchema = z.object({
  action: z.enum(["APPROVED", "REJECTED"]),
  clientName: z.string().min(1).max(100).trim(),
  note: z.string().max(1000).trim().optional(),
});

// POST /api/share/[token] — client approves or rejects proposal
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const link = await prisma.shareLink.findUnique({
      where: { token: params.token },
      include: {
        project: { select: { orgId: true, name: true } },
      },
    });

    if (!link || !link.isActive) throw notFound("Share link");
    if (link.expiresAt && link.expiresAt < new Date())
      return apiError("VALIDATION_ERROR", "This link has expired.", 400);
    if (link.approvalStatus)
      return apiError("CONFLICT", "This proposal has already been responded to.", 409);

    const body = await req.json();
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const { action, clientName, note } = parsed.data;

    const updated = await prisma.shareLink.update({
      where: { id: link.id },
      data: { approvalStatus: action, clientName, approvalNote: note ?? null, approvedAt: new Date() },
    });

    // Notify org admins (in-app + email)
    const admins = await prisma.user.findMany({
      where: { orgId: link.project.orgId, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true, email: true, name: true },
    });
    const org = await prisma.org.findUnique({ where: { id: link.project.orgId }, select: { name: true } });

    if (admins.length > 0) {
      const projectUrl = `${process.env.NEXTAUTH_URL}/dashboard/projects/${link.projectId}?tab=proposal`;

      prisma.notification.createMany({
        data: admins.map(a => ({
          userId: a.id,
          type: action === "APPROVED" ? "proposal.approved" : "proposal.rejected",
          message: `${clientName} ${action === "APPROVED" ? "approved" : "rejected"} the proposal for "${link.project.name}".${note ? ` Note: "${note}"` : ""}`,
          link: `/dashboard/projects/${link.projectId}?tab=proposal`,
          meta: { clientName, action, projectId: link.projectId, note: note ?? null },
        })),
      }).catch((err) => console.error("[share/approve] notification failed:", err));

      // Send email to each admin
      for (const admin of admins) {
        sendEmail({
          to: admin.email,
          subject: `${clientName} ${action === "APPROVED" ? "approved" : "rejected"} the proposal — ${link.project.name}`,
          html: proposalResponseAdminEmailHtml(link.project.name, clientName, action, note, projectUrl),
        }).catch((err) => console.error("[share/approve] admin email failed:", err));
      }
    }

    // Send confirmation email to client if they have an email on record
    if (link.clientEmail) {
      sendEmail({
        to: link.clientEmail,
        subject: `Your response has been received — ${link.project.name}`,
        html: proposalResponseClientEmailHtml(link.project.name, clientName, org?.name ?? "the project team", action, note),
      }).catch((err) => console.error("[share/approve] client confirmation email failed:", err));
    }

    return NextResponse.json({ status: updated.approvalStatus, clientName });
  } catch (err) {
    return handleApiError(err);
  }
}
