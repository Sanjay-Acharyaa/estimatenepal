import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; invitationId: string }> };

const postSchema = z.object({
  action: z.enum(["ACCEPTED", "DECLINED"]),
});

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can respond to tender invitations.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, invitationId } = await params;
    const tenderId = parseInt(id, 10);
    const invitationIdInt = parseInt(invitationId, 10);
    if (isNaN(tenderId) || isNaN(invitationIdInt)) {
      return apiError("VALIDATION_ERROR", "Invalid ID.", 400);
    }

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const invitation = await prisma.bidTenderInvitation.findFirst({
      where: { id: invitationIdInt, tender_id: tenderId },
      select: {
        id: true,
        status: true,
        contractor_user_id: true,
        contractor_email: true,
      },
    });

    if (!invitation) return apiError("NOT_FOUND", "Invitation not found.", 404);

    const ownsInvitation =
      invitation.contractor_user_id === bidUser.id ||
      invitation.contractor_email === (token.email as string);

    if (!ownsInvitation) {
      return apiError("FORBIDDEN", "This invitation does not belong to you.", 403);
    }

    if (invitation.status !== "PENDING") {
      const message =
        invitation.status === "ACCEPTED"
          ? "This invitation has already been accepted."
          : invitation.status === "DECLINED"
            ? "This invitation has already been declined."
            : "This invitation has expired and can no longer be responded to.";
      return apiError("CONFLICT", message, 409);
    }

    const updated = await prisma.bidTenderInvitation.update({
      where: { id: invitation.id },
      data: { status: parsed.data.action, responded_at: new Date() },
      select: { id: true, status: true, responded_at: true },
    });

    return NextResponse.json({ invitation: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
