import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { median } from "@/lib/scoring-helpers";

type Params = { params: Promise<{ id: string }> };

const COMPARISON_STATUSES = ["SUBMITTED", "SHORTLISTED", "AWARDED", "NOT_AWARDED"];
const REVEALED_STATUSES = new Set(["SHORTLISTED", "AWARDED"]);

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can view the bid comparison table.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const view = request.nextUrl.searchParams.get("view") ?? "summary";
    if (!["summary", "detail", "chapter"].includes(view)) {
      return apiError("VALIDATION_ERROR", "Invalid view. Use summary, detail, or chapter.", 400);
    }

    const [tender, outlierSetting] = await Promise.all([
      prisma.tender.findFirst({
        where: { id: tenderId, client_user_id: bidUser.id },
        select: { id: true, bid_deadline: true },
      }),
      prisma.bidPlatformSetting.findUnique({
        where: { key: "outlier_flagging_threshold_percentage" },
        select: { value: true },
      }),
    ]);

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    if (tender.bid_deadline > new Date()) {
      return apiError("CONFLICT", "Comparison table is only available after the bid deadline has passed.", 409);
    }

    const outlierThresholdPct = parseFloat(outlierSetting?.value ?? "30") / 100;

    const bids = await prisma.bidSubmission.findMany({
      where: { tender_id: tenderId, status: { in: COMPARISON_STATUSES } },
      orderBy: { system_score: "desc" },
      select: {
        id: true,
        status: true,
        grand_total_npr: true,
        system_score: true,
        price_score: true,
        quantity_score: true,
        outlier_flagged: true,
        client_note: true,
        manual_rank: true,
        submitted_at: true,
        bidder: { select: { id: true, full_name: true } },
        lineItems: {
          select: {
            boq_item_id: true,
            bidder_quantity: true,
            bidder_rate_npr: true,
            amount_npr: true,
            item_notes: true,
            boqItem: { select: { description: true, is_alternative: true } },
          },
        },
      },
    });

    // ── Summary view ───────────────────────────────────────────────────────────

    if (view === "summary") {
      const summary = bids.map((b) => ({
        bid_id: b.id,
        bidder_name: b.bidder.full_name,
        grand_total_npr: b.grand_total_npr,
        system_score: b.system_score ? Number(b.system_score) : null,
        price_score: b.price_score ? Number(b.price_score) : null,
        quantity_score: b.quantity_score ? Number(b.quantity_score) : null,
        outlier_flagged: b.outlier_flagged,
        status: b.status,
        shortlisted: b.status === "SHORTLISTED",
        manual_rank: b.manual_rank,
        client_note: b.client_note,
      }));
      return NextResponse.json({ summary });
    }

    // ── Shared: bid headers with anonymisation ──────────────────────────────────

    const bidHeaders = bids.map((b, idx) => ({
      bid_id: b.id,
      label: REVEALED_STATUSES.has(b.status)
        ? b.bidder.full_name
        : `Bidder ${String.fromCharCode(65 + idx)}`,
      status: b.status,
    }));

    // ── Detail view ────────────────────────────────────────────────────────────

    const [chapters, boqItems] = await Promise.all([
      prisma.bidBoqChapter.findMany({
        where: { tender_id: tenderId },
        orderBy: [{ level: "asc" }, { sort_order: "asc" }],
        select: { id: true, title: true, sort_order: true, level: true, parent_chapter_id: true },
      }),
      prisma.bidBoqItem.findMany({
        where: { tender_id: tenderId, is_alternative: false },
        orderBy: [{ sort_order: "asc" }],
        select: { id: true, chapter_id: true, item_code: true, description: true, unit: true, client_quantity: true, sort_order: true },
      }),
    ]);

    if (view === "detail") {
      const itemBidMap = new Map<number, Map<number, { quantity: number | null; rate: number; amount: number; item_notes: string | null }>>();

      for (const b of bids) {
        for (const li of b.lineItems) {
          if (li.boqItem.is_alternative) continue;
          if (!itemBidMap.has(li.boq_item_id)) itemBidMap.set(li.boq_item_id, new Map());
          itemBidMap.get(li.boq_item_id)!.set(b.id, {
            quantity: li.bidder_quantity !== null ? Number(li.bidder_quantity) : null,
            rate: Number(li.bidder_rate_npr),
            amount: Number(li.amount_npr),
            item_notes: li.item_notes ?? null,
          });
        }
      }

      const itemMedianRates = new Map<number, number>();
      itemBidMap.forEach((bidMap, itemId) => {
        const rates = Array.from(bidMap.values()).map((v) => v.rate);
        itemMedianRates.set(itemId, median(rates));
      });

      const detail = boqItems.map((item) => {
        const bidData = itemBidMap.get(item.id);
        const med = itemMedianRates.get(item.id) ?? 0;

        const rates = bids.map((b) => bidData?.get(b.id)?.rate ?? 0).filter((r) => r > 0);
        const minRate = rates.length > 0 ? Math.min(...rates) : null;
        const maxRate = rates.length > 0 ? Math.max(...rates) : null;

        const bids_detail: Record<number, { quantity: number | null; rate: number; amount: number; item_notes: string | null; outlier_cell: boolean; is_lowest: boolean; is_highest: boolean }> = {};

        for (const b of bids) {
          const li = bidData?.get(b.id);
          if (!li) {
            bids_detail[b.id] = { quantity: null, rate: 0, amount: 0, item_notes: null, outlier_cell: false, is_lowest: false, is_highest: false };
            continue;
          }
          const outlier_cell = med > 0 && (li.rate > med * (1 + outlierThresholdPct) || li.rate < med * (1 - outlierThresholdPct));
          bids_detail[b.id] = {
            ...li,
            outlier_cell,
            is_lowest: minRate !== null && li.rate === minRate && rates.length > 1,
            is_highest: maxRate !== null && li.rate === maxRate && rates.length > 1,
          };
        }

        return {
          item_id: item.id,
          chapter_id: item.chapter_id,
          item_code: item.item_code ?? null,
          description: item.description,
          unit: item.unit,
          client_quantity: item.client_quantity !== null ? Number(item.client_quantity) : null,
          sort_order: item.sort_order,
          bids: bids_detail,
        };
      });

      return NextResponse.json({ bids: bidHeaders, detail });
    }

    // ── Chapter view ───────────────────────────────────────────────────────────

    const itemChapterMap = new Map<number, number>();
    for (const item of boqItems) {
      itemChapterMap.set(item.id, item.chapter_id);
    }

    const chapter_breakdown = chapters.map((ch) => {
      const subtotals: Record<number, number> = {};
      for (const b of bids) {
        let chapterTotal = 0;
        for (const li of b.lineItems) {
          if (li.boqItem.is_alternative) continue;
          if (itemChapterMap.get(li.boq_item_id) === ch.id) {
            chapterTotal += Number(li.amount_npr);
          }
        }
        subtotals[b.id] = parseFloat(chapterTotal.toFixed(2));
      }
      return {
        chapter_id: ch.id,
        title: ch.title,
        sort_order: ch.sort_order,
        level: ch.level,
        parent_chapter_id: ch.parent_chapter_id,
        subtotals,
      };
    });

    const grand_totals: Record<number, number> = {};
    for (const b of bids) {
      grand_totals[b.id] = parseFloat(Number(b.grand_total_npr ?? 0).toFixed(2));
    }

    return NextResponse.json({ bids: bidHeaders, chapter_breakdown, grand_totals });
  } catch (err) {
    return handleApiError(err);
  }
}
