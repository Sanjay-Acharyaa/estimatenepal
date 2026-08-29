import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; bidId: string }> };

const patchSchema = z
  .object({
    contingency_percentage: z.number().min(0).max(100).optional(),
    notes_to_client: z.string().max(2000).optional(),
  })
  .refine((d) => d.contingency_percentage !== undefined || d.notes_to_client !== undefined, {
    message: "At least one of contingency_percentage or notes_to_client is required.",
  });

const CHAPTER_SELECT = {
  id: true,
  title: true,
  sort_order: true,
  items: {
    orderBy: { sort_order: "asc" as const },
    select: {
      id: true,
      description: true,
      unit: true,
      client_quantity: true,
      sort_order: true,
    },
  },
} as const;

type LineItem = {
  id: number;
  boq_item_id: number;
  bidder_quantity: import("@prisma/client").Prisma.Decimal | null;
  bidder_rate_npr: import("@prisma/client").Prisma.Decimal;
  amount_npr: import("@prisma/client").Prisma.Decimal;
  quantity_justification: string | null;
};

function buildChapters(
  chapters: Array<{
    id: number;
    title: string;
    sort_order: number;
    items: Array<{
      id: number;
      description: string;
      unit: string;
      client_quantity: import("@prisma/client").Prisma.Decimal | null;
      sort_order: number;
    }>;
  }>,
  lineItemMap: Map<number, LineItem>,
  showClientQty: boolean
) {
  return chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    sort_order: ch.sort_order,
    items: ch.items.map((item) => {
      const li = lineItemMap.get(item.id) ?? null;
      return {
        boq_item_id: item.id,
        description: item.description,
        unit: item.unit,
        client_quantity: showClientQty ? item.client_quantity : null,
        line_item: li
          ? {
              id: li.id,
              bidder_quantity: li.bidder_quantity,
              bidder_rate_npr: li.bidder_rate_npr,
              amount_npr: li.amount_npr,
              quantity_justification: li.quantity_justification,
            }
          : null,
      };
    }),
  }));
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("NOT_FOUND", "Bid not found.", 404);

    if (procurementRoles.includes("CLIENT")) {
      const [tender, bid] = await Promise.all([
        prisma.tender.findFirst({
          where: { id: tenderId, client_user_id: bidUser.id },
          select: { id: true, quantity_visibility: true },
        }),
        prisma.bidSubmission.findFirst({
          where: { id: bidIdInt, tender_id: tenderId },
          select: {
            id: true, tender_id: true, status: true, version: true,
            contingency_percentage: true, grand_total_npr: true,
            contingency_amount_npr: true, vat_amount_npr: true, total_with_vat_npr: true,
            notes_to_client: true, submitted_at: true, created_at: true, updated_at: true,
            bidder: { select: { id: true, full_name: true } },
          },
        }),
      ]);

      if (!tender || !bid) return apiError("NOT_FOUND", "Bid not found.", 404);

      const [chapters, lineItems] = await Promise.all([
        prisma.bidBoqChapter.findMany({
          where: { tender_id: tenderId },
          orderBy: { sort_order: "asc" },
          select: CHAPTER_SELECT,
        }),
        prisma.bidSubmissionLineItem.findMany({
          where: { bid_id: bidIdInt },
          select: { id: true, boq_item_id: true, bidder_quantity: true, bidder_rate_npr: true, amount_npr: true, quantity_justification: true },
        }),
      ]);

      const lineItemMap = new Map(lineItems.map((li) => [li.boq_item_id, li]));

      return NextResponse.json({
        bid: {
          id: bid.id, tender_id: bid.tender_id, status: bid.status, version: bid.version,
          bidder_name: bid.bidder.full_name,
          contingency_percentage: bid.contingency_percentage,
          grand_total_npr: bid.grand_total_npr, contingency_amount_npr: bid.contingency_amount_npr,
          vat_amount_npr: bid.vat_amount_npr, total_with_vat_npr: bid.total_with_vat_npr,
          notes_to_client: bid.notes_to_client, submitted_at: bid.submitted_at,
          created_at: bid.created_at, updated_at: bid.updated_at,
          chapters: buildChapters(chapters, lineItemMap, true),
        },
      });
    }

    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Access denied.", 403);
    }

    // Ownership enforced — bidder_user_id must match
    const bid = await prisma.bidSubmission.findFirst({
      where: { id: bidIdInt, tender_id: tenderId, bidder_user_id: bidUser.id },
      select: {
        id: true, tender_id: true, status: true, version: true,
        contingency_percentage: true, notes_to_client: true,
        submitted_at: true, withdrawn_at: true, withdrawal_count: true,
        created_at: true, updated_at: true,
      },
    });

    if (!bid) return apiError("NOT_FOUND", "Bid not found.", 404);

    const [tender, chapters, lineItems, maxWithdrawalSetting, revisionSetting] = await Promise.all([
      prisma.tender.findUnique({
        where: { id: tenderId },
        select: { quantity_visibility: true, vat_percentage: true, title: true, reference_number: true, bid_deadline: true, status: true },
      }),
      prisma.bidBoqChapter.findMany({
        where: { tender_id: tenderId },
        orderBy: { sort_order: "asc" },
        select: CHAPTER_SELECT,
      }),
      prisma.bidSubmissionLineItem.findMany({
        where: { bid_id: bidIdInt },
        select: { id: true, boq_item_id: true, bidder_quantity: true, bidder_rate_npr: true, amount_npr: true, quantity_justification: true },
      }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "max_withdrawals_per_bid" }, select: { value: true } }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "feature_bid_revision" }, select: { value: true } }),
    ]);

    const showClientQty = tender?.quantity_visibility === "VISIBLE";
    const lineItemMap = new Map(lineItems.map((li) => [li.boq_item_id, li]));

    const now = new Date();
    const deadlinePassed = !!tender?.bid_deadline && tender.bid_deadline < now;
    const isEditable =
      bid.status === "DRAFT" ||
      (bid.status === "SUBMITTED" && !!tender?.bid_deadline && tender.bid_deadline > now && tender.status === "PUBLISHED");

    return NextResponse.json({
      bid: {
        id: bid.id, tender_id: bid.tender_id, status: bid.status, version: bid.version,
        contingency_percentage: bid.contingency_percentage,
        notes_to_client: bid.notes_to_client,
        submitted_at: bid.submitted_at,
        withdrawn_at: bid.withdrawn_at?.toISOString() ?? null,
        withdrawal_count: bid.withdrawal_count,
        max_withdrawals: parseInt(maxWithdrawalSetting?.value ?? "1", 10),
        created_at: bid.created_at, updated_at: bid.updated_at,
        quantity_visibility: tender?.quantity_visibility ?? "HIDDEN",
        vat_percentage: Number(tender?.vat_percentage ?? 13),
        tender_title: tender?.title ?? "",
        tender_reference: tender?.reference_number ?? "",
        bid_deadline: tender?.bid_deadline?.toISOString() ?? null,
        is_editable: isEditable,
        deadline_passed: deadlinePassed,
        revision_enabled: revisionSetting?.value === "true",
        chapters: buildChapters(chapters, lineItemMap, showClientQty),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can update their bids.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("NOT_FOUND", "Bid not found.", 404);

    const [bid, tender] = await Promise.all([
      prisma.bidSubmission.findFirst({
        where: { id: bidIdInt, tender_id: tenderId, bidder_user_id: bidUser.id },
        select: { id: true, status: true, grand_total_npr: true, contingency_percentage: true },
      }),
      prisma.tender.findUnique({
        where: { id: tenderId },
        select: { vat_percentage: true, bid_deadline: true, status: true },
      }),
    ]);

    if (!bid || !tender) return apiError("NOT_FOUND", "Bid not found.", 404);

    if (bid.status !== "DRAFT" && bid.status !== "SUBMITTED") {
      return apiError("CONFLICT", "Only draft or submitted bids can be updated.", 409);
    }

    if (tender.bid_deadline <= new Date() || tender.status !== "PUBLISHED") {
      return apiError("CONFLICT", "Bid editing is no longer allowed — the submission deadline has passed.", 409);
    }

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.notes_to_client !== undefined) {
      updateData.notes_to_client = parsed.data.notes_to_client;
    }

    if (parsed.data.contingency_percentage !== undefined) {
      const grandTotal = Number(bid.grand_total_npr ?? 0);
      const contingencyPct = parsed.data.contingency_percentage;
      const vatPct = Number(tender.vat_percentage);
      const contingencyAmt = parseFloat((grandTotal * contingencyPct / 100).toFixed(2));
      const vatAmt = parseFloat(((grandTotal + contingencyAmt) * vatPct / 100).toFixed(2));
      const totalWithVat = parseFloat((grandTotal + contingencyAmt + vatAmt).toFixed(2));
      updateData.contingency_percentage = contingencyPct;
      updateData.contingency_amount_npr = contingencyAmt;
      updateData.vat_amount_npr = vatAmt;
      updateData.total_with_vat_npr = totalWithVat;
    }

    const updated = await prisma.bidSubmission.update({
      where: { id: bidIdInt },
      data: updateData,
      select: {
        id: true, status: true, contingency_percentage: true, contingency_amount_npr: true,
        grand_total_npr: true, vat_amount_npr: true, total_with_vat_npr: true,
        notes_to_client: true, updated_at: true,
      },
    });

    return NextResponse.json({ bid: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
