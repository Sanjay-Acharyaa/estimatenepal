import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");

    if (!isClient && !isContractor) {
      return apiError("FORBIDDEN", "Insufficient permissions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: {
        id: tenderId,
        ...(isClient ? { client_user_id: bidUser.id } : {}),
        ...(isContractor ? { submissions: { some: { bidder_user_id: bidUser.id, status: "AWARDED" } } } : {}),
      },
      select: { id: true },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    // Only show ratings when both parties have submitted (is_visible = true)
    const ratings = await prisma.bidRating.findMany({
      where: { tender_id: tenderId, is_visible: true },
      select: {
        id: true,
        rating_direction: true,
        score_1: true,
        score_2: true,
        score_3: true,
        score_4: true,
        score_5: true,
        average_score: true,
        review_text: true,
        is_anonymous: true,
        submitted_at: true,
        rater: { select: { full_name: true } },
        rated: { select: { full_name: true } },
      },
    });

    // Also return the current user's own rating (even if not yet visible)
    const myRating = await prisma.bidRating.findFirst({
      where: { tender_id: tenderId, rater_user_id: bidUser.id },
      select: {
        id: true,
        score_1: true,
        score_2: true,
        score_3: true,
        score_4: true,
        score_5: true,
        average_score: true,
        review_text: true,
        is_anonymous: true,
        is_visible: true,
        window_closes_at: true,
      },
    });

    return NextResponse.json({ ratings, my_rating: myRating });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");

    if (!isClient && !isContractor) {
      return apiError("FORBIDDEN", "Insufficient permissions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as {
      score_1: number;
      score_2: number;
      score_3: number;
      score_4: number;
      score_5: number;
      review_text?: string;
      is_anonymous?: boolean;
    };

    const scores = [body.score_1, body.score_2, body.score_3, body.score_4, body.score_5];
    if (scores.some((s) => typeof s !== "number" || s < 1 || s > 5)) {
      return apiError("VALIDATION_ERROR", "Each score must be between 1 and 5.", 400);
    }

    const averageScore = scores.reduce((a, b) => a + b, 0) / 5;

    const existing = await prisma.bidRating.findFirst({
      where: { tender_id: tenderId, rater_user_id: bidUser.id },
      select: { id: true, window_closes_at: true, is_visible: true },
    });

    if (!existing) return apiError("NOT_FOUND", "No rating window found for this tender.", 404);
    if (existing.is_visible) return apiError("CONFLICT", "Rating already submitted and finalized.", 409);
    if (existing.window_closes_at && existing.window_closes_at < new Date()) {
      return apiError("CONFLICT", "Rating window has closed.", 409);
    }

    await prisma.bidRating.update({
      where: { id: existing.id },
      data: {
        score_1: body.score_1,
        score_2: body.score_2,
        score_3: body.score_3,
        score_4: body.score_4,
        score_5: body.score_5,
        average_score: averageScore,
        review_text: body.review_text?.trim() ?? null,
        is_anonymous: body.is_anonymous ?? false,
        submitted_at: new Date(),
      },
    });

    // Check if both parties have now submitted real scores
    const allRatings = await prisma.bidRating.findMany({
      where: { tender_id: tenderId },
      select: { id: true, average_score: true },
    });

    // average_score > 0 means the party has actually submitted
    const bothSubmitted = allRatings.length === 2 && allRatings.every((r) => Number(r.average_score) > 0);

    if (bothSubmitted) {
      await prisma.bidRating.updateMany({
        where: { tender_id: tenderId },
        data: { is_visible: true },
      });
    }

    return NextResponse.json({ ok: true, both_submitted: bothSubmitted });
  } catch (err) {
    return handleApiError(err);
  }
}
