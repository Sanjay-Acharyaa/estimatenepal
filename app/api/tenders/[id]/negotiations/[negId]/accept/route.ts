import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { dispatchUserNotification } from "@/lib/notifications";

type Params = { params: Promise<{ id: string; negId: string }> };

// Estimation simplification: awards the SHORTLISTED bid directly (no FINAL_REVISED status required)
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can accept a negotiation.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, negId } = await params;
    const tenderId = parseInt(id, 10);
    const negotiationId = parseInt(negId, 10);
    if (isNaN(tenderId) || isNaN(negotiationId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true, status: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (!["NEGOTIATION", "UNDER_REVIEW"].includes(tender.status)) {
      return apiError("CONFLICT", "Tender is not in a state that allows acceptance.", 409);
    }

    const neg = await prisma.bidNegotiation.findFirst({
      where: { id: negotiationId, tender_id: tenderId, status: "ACTIVE" },
      select: {
        id: true,
        bidder_user_id: true,
        current_proposed_total_npr: true,
      },
    });
    if (!neg) return apiError("NOT_FOUND", "Active negotiation not found.", 404);

    // Find the SHORTLISTED bid for this bidder
    const winningBid = await prisma.bidSubmission.findFirst({
      where: { tender_id: tenderId, bidder_user_id: neg.bidder_user_id, status: "SHORTLISTED" },
      select: { id: true, grand_total_npr: true, total_with_vat_npr: true },
    });
    if (!winningBid) return apiError("CONFLICT", "No shortlisted bid found for this bidder.", 409);

    const awardedAmount = Number(neg.current_proposed_total_npr);

    await prisma.$transaction(async (tx) => {
      // Close this negotiation as CLOSED_AGREEMENT
      await tx.bidNegotiation.update({
        where: { id: negotiationId },
        data: { status: "CLOSED_AGREEMENT", closed_at: new Date() },
      });
      // Close all other ACTIVE negotiations for this tender
      await tx.bidNegotiation.updateMany({
        where: { tender_id: tenderId, status: "ACTIVE", id: { not: negotiationId } },
        data: { status: "CLOSED_NO_AGREEMENT", closed_at: new Date() },
      });
      // Award the winning bid
      await tx.bidSubmission.update({
        where: { id: winningBid.id },
        data: { status: "AWARDED" },
      });
      // Mark all other non-awarded bids NOT_AWARDED
      await tx.bidSubmission.updateMany({
        where: { tender_id: tenderId, id: { not: winningBid.id }, status: { not: "AWARDED" } },
        data: { status: "NOT_AWARDED" },
      });
      // Update tender: AWARDED + winner info
      await tx.tender.update({
        where: { id: tenderId },
        data: {
          status: "AWARDED",
          awarded_bidder_id: neg.bidder_user_id,
          awarded_amount_npr: awardedAmount,
          awarded_at: new Date(),
        },
      });
    });

    // Notify winner
    await dispatchUserNotification(
      neg.bidder_user_id.toString(),
      "bid.awarded",
      { tender_id: String(tenderId) }
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
