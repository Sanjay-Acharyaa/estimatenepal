import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { mean, stdDev, clamp, median } from "@/lib/scoring-helpers";

type Params = { params: Promise<{ id: string }> };

const SCORING_STATUSES = ["SUBMITTED", "SHORTLISTED", "AWARDED"];

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can run scoring.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const [tender, settings] = await Promise.all([
      prisma.tender.findFirst({
        where: { id: tenderId, client_user_id: bidUser.id },
        select: { id: true, bid_deadline: true, quantity_visibility: true },
      }),
      prisma.bidPlatformSetting.findMany({
        where: { key: { in: ["scoring_weight_price", "scoring_weight_quantity", "outlier_flagging_threshold_percentage"] } },
        select: { key: true, value: true },
      }),
    ]);

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    if (tender.bid_deadline > new Date()) {
      return apiError("CONFLICT", "Scoring is only available after the bid deadline has passed.", 409);
    }

    const settingMap = new Map(settings.map((s) => [s.key, s.value]));
    const weightPrice = parseFloat(settingMap.get("scoring_weight_price") ?? "70");
    const weightQty = parseFloat(settingMap.get("scoring_weight_quantity") ?? "30");
    const outlierThresholdPct = parseFloat(settingMap.get("outlier_flagging_threshold_percentage") ?? "30") / 100;

    const totalWeight = weightPrice + weightQty;
    if (Math.round(totalWeight) !== 100) {
      return apiError("VALIDATION_ERROR", `Scoring weights sum to ${totalWeight}%, not 100%. Update scoring_weight_price and scoring_weight_quantity in platform settings.`, 422);
    }

    const [bids, boqItems] = await Promise.all([
      prisma.bidSubmission.findMany({
        where: { tender_id: tenderId, status: { in: SCORING_STATUSES } },
        select: {
          id: true,
          grand_total_npr: true,
          lineItems: {
            select: { boq_item_id: true, bidder_rate_npr: true, bidder_quantity: true },
          },
        },
      }),
      prisma.bidBoqItem.findMany({
        where: { tender_id: tenderId, is_alternative: false },
        select: { id: true, client_quantity: true },
      }),
    ]);

    if (bids.length === 0) return NextResponse.json({ scored_bids: [] });

    // ── PRICE_SCORE ────────────────────────────────────────────────────────────

    const totals = bids.map((b) => Number(b.grand_total_npr ?? 0));
    const priceMean = mean(totals);
    const priceStdDev = stdDev(totals, priceMean);
    const lowCutoff = priceMean - 2 * priceStdDev;

    const nonOutlierTotals = totals.filter((t) => t >= lowCutoff);
    const minT = nonOutlierTotals.length > 0 ? Math.min(...nonOutlierTotals) : 0;
    const maxT = nonOutlierTotals.length > 0 ? Math.max(...nonOutlierTotals) : 0;

    const priceScores = bids.map((b) => {
      const t = Number(b.grand_total_npr ?? 0);
      if (t < lowCutoff) return 0;
      if (maxT === minT) return 100;
      return clamp(((maxT - t) / (maxT - minT)) * 100);
    });

    // ── QUANTITY_SCORE ─────────────────────────────────────────────────────────

    const boqItemMap = new Map(
      boqItems.map((item) => [item.id, item.client_quantity !== null ? Number(item.client_quantity) : null])
    );

    const rawQtyScores: (number | null)[] = bids.map((b) => {
      if (tender.quantity_visibility === "HIDDEN") return null;

      const deviations: number[] = [];
      for (const li of b.lineItems) {
        const cQty = boqItemMap.get(li.boq_item_id);
        if (cQty === null || cQty === undefined || cQty === 0) continue;
        const bQty = li.bidder_quantity !== null ? Number(li.bidder_quantity) : cQty;
        deviations.push((Math.abs(bQty - cQty) / cQty) * 100);
      }

      if (deviations.length === 0) return null;
      return clamp(100 - mean(deviations));
    });

    const definedQtyScores = rawQtyScores.filter((s): s is number => s !== null);
    const platformQtyAvg = definedQtyScores.length > 0 ? mean(definedQtyScores) : 50;
    const quantityScores = rawQtyScores.map((s) => s ?? platformQtyAvg);

    // ── SYSTEM_SCORE ───────────────────────────────────────────────────────────

    const systemScores = bids.map((_, idx) =>
      parseFloat(
        (priceScores[idx] * (weightPrice / 100) + quantityScores[idx] * (weightQty / 100)).toFixed(4)
      )
    );

    // ── OUTLIER_FLAGGED ────────────────────────────────────────────────────────

    const itemRates = new Map<number, number[]>();
    for (const b of bids) {
      for (const li of b.lineItems) {
        const existing = itemRates.get(li.boq_item_id) ?? [];
        existing.push(Number(li.bidder_rate_npr));
        itemRates.set(li.boq_item_id, existing);
      }
    }

    const outlierFlags = bids.map((b) => {
      for (const li of b.lineItems) {
        const rates = itemRates.get(li.boq_item_id) ?? [];
        if (rates.length < 2) continue;
        const med = median(rates);
        if (med === 0) continue;
        const rate = Number(li.bidder_rate_npr);
        if (rate > med * (1 + outlierThresholdPct) || rate < med * (1 - outlierThresholdPct)) {
          return true;
        }
      }
      return false;
    });

    // ── Persist ────────────────────────────────────────────────────────────────

    await prisma.$transaction(
      bids.map((b, idx) =>
        prisma.bidSubmission.update({
          where: { id: b.id },
          data: {
            price_score: parseFloat(priceScores[idx].toFixed(4)),
            quantity_score: parseFloat(quantityScores[idx].toFixed(4)),
            system_score: systemScores[idx],
            outlier_flagged: outlierFlags[idx],
          },
        })
      )
    );

    const scoredBids = bids.map((b, idx) => ({
      bid_id: b.id,
      price_score: parseFloat(priceScores[idx].toFixed(4)),
      quantity_score: parseFloat(quantityScores[idx].toFixed(4)),
      system_score: systemScores[idx],
      outlier_flagged: outlierFlags[idx],
    }));

    return NextResponse.json({ scored_bids: scoredBids });
  } catch (err) {
    return handleApiError(err);
  }
}
