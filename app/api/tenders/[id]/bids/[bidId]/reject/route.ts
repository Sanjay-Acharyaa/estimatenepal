import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { emitProcurementNotification } from "@/lib/procurement-notify";

type Params = { params: Promise<{ id: string; bidId: string }> };

const REJECTABLE: string[] = ["SUBMITTED", "SHORTLISTED"];

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can reject bids.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("NOT_FOUND", "Not found.", 404);

    const [tender, bid] = await Promise.all([
      prisma.tender.findFirst({
        where: { id: tenderId, client_user_id: bidUser.id },
        select: { id: true },
      }),
      prisma.bidSubmission.findFirst({
        where: { id: bidIdInt, tender_id: tenderId },
        select: { id: true, status: true, bidder_user_id: true },
      }),
    ]);

    if (!tender || !bid) return apiError("NOT_FOUND", "Bid not found.", 404);

    if (!REJECTABLE.includes(bid.status)) {
      return apiError("CONFLICT", `Only submitted or shortlisted bids can be rejected. Current status: ${bid.status}.`, 409);
    }

    const updated = await prisma.bidSubmission.update({
      where: { id: bidIdInt },
      data: { status: "REJECTED" },
      select: { id: true, status: true, updated_at: true },
    });

    ;(async () => {
      try {
        const bidderBidUser = await prisma.bidUser.findUnique({
          where: { id: bid.bidder_user_id },
          select: { email: true },
        });
        if (!bidderBidUser) return;
        const bidderEstUser = await prisma.user.findUnique({
          where: { email: bidderBidUser.email },
          select: { id: true },
        });
        if (bidderEstUser) emitProcurementNotification(bidderEstUser.id, "bid.rejected", { tender_id: tenderId, bid_id: bidIdInt });
      } catch (err) {
        console.error("[reject-notify]", err instanceof Error ? err.message : err);
      }
    })();

    return NextResponse.json({ bid: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
