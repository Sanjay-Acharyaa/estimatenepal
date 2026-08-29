import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; bidId: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can submit bids.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("NOT_FOUND", "Bid not found.", 404);

    const [bid, tender] = await Promise.all([
      prisma.bidSubmission.findFirst({
        where: { id: bidIdInt, tender_id: tenderId, bidder_user_id: bidUser.id },
        select: { id: true, status: true, version: true, grand_total_npr: true },
      }),
      prisma.tender.findFirst({
        where: { id: tenderId, status: "PUBLISHED", bid_deadline: { gt: new Date() } },
        select: { id: true, quantity_visibility: true },
      }),
    ]);

    if (!bid) return apiError("NOT_FOUND", "Bid not found.", 404);
    if (!tender) return apiError("CONFLICT", "Bid deadline has passed or tender is no longer published.", 409);

    if (bid.status !== "DRAFT" && bid.status !== "WITHDRAWN") {
      return apiError("CONFLICT", "Only draft or withdrawn bids can be submitted.", 409);
    }

    const [boqItems, bidLineItems] = await Promise.all([
      prisma.bidBoqItem.findMany({
        where: { tender_id: tenderId },
        select: { id: true, client_quantity: true },
      }),
      prisma.bidSubmissionLineItem.findMany({
        where: { bid_id: bidIdInt },
        select: { boq_item_id: true, bidder_rate_npr: true, bidder_quantity: true, quantity_justification: true },
      }),
    ]);

    const lineItemMap = new Map(bidLineItems.map((li) => [li.boq_item_id, li]));
    const isHidden = tender.quantity_visibility === "HIDDEN";
    const validationErrors: string[] = [];

    for (const boqItem of boqItems) {
      const li = lineItemMap.get(boqItem.id);
      if (!li) { validationErrors.push(`BOQ item ${boqItem.id}: no rate entered.`); continue; }
      if (Number(li.bidder_rate_npr) <= 0) {
        validationErrors.push(`BOQ item ${boqItem.id}: rate must be greater than zero.`);
      }
      if (isHidden) {
        if (li.bidder_quantity === null || Number(li.bidder_quantity) <= 0) {
          validationErrors.push(`BOQ item ${boqItem.id}: bidder quantity is required when quantities are hidden.`);
        }
      } else {
        const clientQty = boqItem.client_quantity !== null ? Number(boqItem.client_quantity) : null;
        const bidderQty = li.bidder_quantity !== null ? Number(li.bidder_quantity) : null;
        if (bidderQty !== null && clientQty !== null && bidderQty.toFixed(4) !== clientQty.toFixed(4) && !li.quantity_justification) {
          validationErrors.push(`BOQ item ${boqItem.id}: justification required when overriding client quantity.`);
        }
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Bid is incomplete.", details: validationErrors } },
        { status: 422 }
      );
    }

    if (Number(bid.grand_total_npr ?? 0) <= 0) {
      return apiError("VALIDATION_ERROR", "Grand total must be greater than zero.", 422);
    }

    const submitted = await prisma.bidSubmission.update({
      where: { id: bidIdInt },
      data: { status: "SUBMITTED", submitted_at: new Date(), version: bid.version + 1, withdrawn_at: null, withdrawal_reason: null },
      select: {
        id: true, status: true, version: true, grand_total_npr: true,
        contingency_amount_npr: true, total_with_vat_npr: true, submitted_at: true, updated_at: true,
      },
    });

    return NextResponse.json({ bid: submitted });
  } catch (err) {
    return handleApiError(err);
  }
}
