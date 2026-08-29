import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; bidId: string }> };

const bodySchema = z.object({ reason: z.string().max(500).optional() });

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can withdraw bids.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("NOT_FOUND", "Bid not found.", 404);

    let body: unknown;
    try { body = await request.json(); } catch { body = {}; }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const [bid, tender, maxWithdrawalSetting, cooldownSetting, thresholdSetting, windowSetting] = await Promise.all([
      prisma.bidSubmission.findFirst({
        where: { id: bidIdInt, tender_id: tenderId, bidder_user_id: bidUser.id },
        select: { id: true, status: true, withdrawal_count: true, withdrawn_at: true },
      }),
      prisma.tender.findFirst({
        where: { id: tenderId, status: "PUBLISHED" },
        select: { id: true, bid_deadline: true },
      }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "max_withdrawals_per_bid" }, select: { value: true } }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "withdrawal_cooldown_hours" }, select: { value: true } }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "contractor_withdrawal_flag_threshold" }, select: { value: true } }),
      prisma.bidPlatformSetting.findUnique({ where: { key: "contractor_withdrawal_flag_window_months" }, select: { value: true } }),
    ]);

    if (!bid || !tender) return apiError("NOT_FOUND", "Bid not found.", 404);

    if (bid.status !== "SUBMITTED") {
      return apiError("CONFLICT", `Only submitted bids can be withdrawn. Current status: ${bid.status}.`, 409);
    }

    const now = new Date();
    if (tender.bid_deadline <= now) {
      return apiError("CONFLICT", "The bid deadline has passed. Withdrawal is no longer allowed.", 409);
    }

    const maxWithdrawals = parseInt(maxWithdrawalSetting?.value ?? "1", 10);
    if (bid.withdrawal_count >= maxWithdrawals) {
      return NextResponse.json(
        { error: { code: "MAX_WITHDRAWALS", message: "Maximum withdrawals reached for this bid." } },
        { status: 409 }
      );
    }

    const cooldownHours = parseInt(cooldownSetting?.value ?? "24", 10);
    if (bid.withdrawn_at && cooldownHours > 0) {
      const cooldownMs = cooldownHours * 3_600_000;
      const elapsed = now.getTime() - bid.withdrawn_at.getTime();
      if (elapsed < cooldownMs) {
        const hours_remaining = Math.ceil((cooldownMs - elapsed) / 3_600_000);
        return NextResponse.json(
          { error: { code: "COOLDOWN", message: `Withdrawal cooldown active. Please wait ${hours_remaining} more hour${hours_remaining !== 1 ? "s" : ""}.`, hours_remaining } },
          { status: 409 }
        );
      }
    }

    void windowSetting;

    const flagThreshold = parseInt(thresholdSetting?.value ?? "3", 10);
    const newWithdrawalCount = bid.withdrawal_count + 1;
    const setFlagged = newWithdrawalCount >= flagThreshold;

    const updated = await prisma.bidSubmission.update({
      where: { id: bidIdInt },
      data: {
        status: "WITHDRAWN",
        withdrawn_at: now,
        withdrawal_reason: parsed.data.reason ?? null,
        withdrawal_count: { increment: 1 },
        ...(setFlagged ? { flagged_for_withdrawal: true } : {}),
      },
      select: { id: true, status: true, withdrawn_at: true, withdrawal_count: true, flagged_for_withdrawal: true },
    });

    return NextResponse.json({ bid: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
