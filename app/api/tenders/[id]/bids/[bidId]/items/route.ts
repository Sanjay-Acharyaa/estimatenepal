import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; bidId: string }> };

const lineItemSchema = z.object({
  boq_item_id: z.number().int().positive(),
  bidder_rate_npr: z.number().positive(),
  bidder_quantity: z.number().positive().optional(),
  quantity_justification: z.string().optional(),
});

const bodySchema = z.array(lineItemSchema).min(1);

function computeTotals(grandTotal: number, contingencyPct: number, vatPct: number) {
  const contingency_amount_npr = parseFloat((grandTotal * contingencyPct / 100).toFixed(2));
  const vat_amount_npr = parseFloat(((grandTotal + contingency_amount_npr) * vatPct / 100).toFixed(2));
  const total_with_vat_npr = parseFloat((grandTotal + contingency_amount_npr + vat_amount_npr).toFixed(2));
  return { contingency_amount_npr, vat_amount_npr, total_with_vat_npr };
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can save bid items.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("VALIDATION_ERROR", "Invalid ID.", 400);

    const [bid, tender] = await Promise.all([
      prisma.bidSubmission.findFirst({
        where: { id: bidIdInt, tender_id: tenderId, bidder_user_id: bidUser.id },
        select: { id: true, status: true, contingency_percentage: true },
      }),
      prisma.tender.findUnique({
        where: { id: tenderId },
        select: { vat_percentage: true, bid_deadline: true, status: true },
      }),
    ]);

    if (!bid || !tender) return apiError("NOT_FOUND", "Bid not found.", 404);

    if (bid.status !== "DRAFT" && bid.status !== "SUBMITTED") {
      return apiError("CONFLICT", "Only draft or submitted bids can be edited.", 409);
    }

    if (tender.bid_deadline <= new Date() || tender.status !== "PUBLISHED") {
      return apiError("CONFLICT", "Bid editing is no longer allowed — the submission deadline has passed.", 409);
    }

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const items = parsed.data;
    const boqItemIds = items.map((i) => i.boq_item_id);

    const boqItems = await prisma.bidBoqItem.findMany({
      where: { id: { in: boqItemIds }, tender_id: tenderId },
      select: { id: true, client_quantity: true },
    });

    if (boqItems.length !== boqItemIds.length) {
      const foundIds = new Set(boqItems.map((b) => b.id));
      const missing = boqItemIds.filter((itemId) => !foundIds.has(itemId));
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: `BOQ items not found on this tender: ${missing.join(", ")}` } },
        { status: 422 }
      );
    }

    const boqItemMap = new Map(boqItems.map((b) => [b.id, b]));

    const updatedBid = await prisma.$transaction(async (tx) => {
      const toUpsert = items.map((item) => {
        const boqItem = boqItemMap.get(item.boq_item_id)!;
        const qty =
          item.bidder_quantity ??
          (boqItem.client_quantity !== null ? Number(boqItem.client_quantity) : 0);
        const amount_npr = parseFloat((qty * item.bidder_rate_npr).toFixed(2));
        return {
          bid_id: bidIdInt,
          boq_item_id: item.boq_item_id,
          bidder_quantity: item.bidder_quantity ?? null,
          bidder_rate_npr: item.bidder_rate_npr,
          amount_npr,
          quantity_justification: item.quantity_justification ?? null,
        };
      });

      await tx.bidSubmissionLineItem.deleteMany({ where: { bid_id: bidIdInt, boq_item_id: { in: boqItemIds } } });
      await tx.bidSubmissionLineItem.createMany({ data: toUpsert });

      const agg = await tx.bidSubmissionLineItem.aggregate({
        where: { bid_id: bidIdInt },
        _sum: { amount_npr: true },
      });
      const grandTotal = parseFloat(Number(agg._sum.amount_npr ?? 0).toFixed(2));
      const contingencyPct = Number(bid.contingency_percentage ?? 0);
      const vatPct = Number(tender.vat_percentage);
      const totals = computeTotals(grandTotal, contingencyPct, vatPct);

      const updBid = await tx.bidSubmission.update({
        where: { id: bidIdInt },
        data: {
          grand_total_npr: grandTotal,
          contingency_amount_npr: totals.contingency_amount_npr,
          vat_amount_npr: totals.vat_amount_npr,
          total_with_vat_npr: totals.total_with_vat_npr,
        },
        select: { id: true, grand_total_npr: true, contingency_amount_npr: true, total_with_vat_npr: true, updated_at: true },
      });

      return { bid: updBid, savedItems: toUpsert.map((u) => ({ boq_item_id: u.boq_item_id, amount_npr: u.amount_npr })) };
    });

    return NextResponse.json(updatedBid);
  } catch (err) {
    return handleApiError(err);
  }
}
