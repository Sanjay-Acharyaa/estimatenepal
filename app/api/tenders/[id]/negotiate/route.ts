import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can open negotiations.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true, status: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (!["UNDER_REVIEW", "NEGOTIATION"].includes(tender.status)) {
      return apiError("CONFLICT", "Tender must be UNDER_REVIEW or NEGOTIATION to open negotiations.", 409);
    }

    const body = await request.json();
    const { bidder_user_ids, deadline } = body as { bidder_user_ids: number[]; deadline: string };

    if (!Array.isArray(bidder_user_ids) || bidder_user_ids.length === 0) {
      return apiError("VALIDATION_ERROR", "At least one bidder must be selected.", 400);
    }
    if (!deadline) {
      return apiError("VALIDATION_ERROR", "Deadline is required.", 400);
    }
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
      return apiError("VALIDATION_ERROR", "Deadline must be in the future.", 400);
    }

    // Only SHORTLISTED bids qualify
    const eligibleBids = await prisma.bidSubmission.findMany({
      where: { tender_id: tenderId, bidder_user_id: { in: bidder_user_ids }, status: "SHORTLISTED" },
      select: { id: true, bidder_user_id: true, grand_total_npr: true, total_with_vat_npr: true },
    });

    if (eligibleBids.length === 0) {
      return apiError("VALIDATION_ERROR", "No shortlisted bids found for the selected bidders.", 400);
    }

    // Skip bidders already in ACTIVE negotiation for this tender
    const existingActive = await prisma.bidNegotiation.findMany({
      where: { tender_id: tenderId, status: "ACTIVE" },
      select: { bidder_user_id: true },
    });
    const alreadyActive = new Set(existingActive.map((n) => n.bidder_user_id));

    const toCreate = eligibleBids.filter((b) => !alreadyActive.has(b.bidder_user_id));

    const created = await prisma.$transaction(async (tx) => {
      const negotiations = [];
      for (const bid of toCreate) {
        const originalTotal = Number(bid.total_with_vat_npr ?? bid.grand_total_npr ?? 0);
        const neg = await tx.bidNegotiation.create({
          data: {
            tender_id: tenderId,
            bidder_user_id: bid.bidder_user_id,
            status: "ACTIVE",
            deadline: deadlineDate,
            original_grand_total_npr: originalTotal,
            current_proposed_total_npr: originalTotal,
            proposed_discount_percentage: 0,
          },
        });
        negotiations.push(neg);
      }
      // Advance tender to NEGOTIATION if still UNDER_REVIEW
      if (tender.status === "UNDER_REVIEW") {
        await tx.tender.update({ where: { id: tenderId }, data: { status: "NEGOTIATION" } });
      }
      return negotiations;
    });

    return NextResponse.json({ negotiations: created }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
