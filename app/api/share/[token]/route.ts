import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, notFound } from "@/lib/errors";

const approveSchema = z.object({
  action: z.enum(["APPROVED", "REJECTED"]),
  clientName: z.string().min(1).max(100).trim(),
  note: z.string().max(1000).trim().optional(),
});

// POST /api/share/[token] — client approves or rejects proposal
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const link = await prisma.shareLink.findUnique({
      where: { token: params.token },
      include: { project: { select: { orgId: true, name: true } } },
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

    // Notify org admins
    const admins = await prisma.user.findMany({
      where: { orgId: link.project.orgId, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map(a => ({
          userId: a.id,
          type: action === "APPROVED" ? "proposal.approved" : "proposal.rejected",
          message: `${clientName} ${action === "APPROVED" ? "approved" : "rejected"} the proposal for "${link.project.name}".${note ? ` Note: "${note}"` : ""}`,
          link: `/dashboard/projects/${link.projectId}?tab=proposal`,
          meta: { clientName, action, projectId: link.projectId, note: note ?? null },
        })),
      });
    }

    return NextResponse.json({ status: updated.approvalStatus, clientName });
  } catch (err) {
    return handleApiError(err);
  }
}
