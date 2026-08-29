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
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can list bids.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const bids = await prisma.bidSubmission.findMany({
      where: { tender_id: tenderId, status: { in: ["SUBMITTED", "SHORTLISTED", "AWARDED", "NOT_AWARDED", "REJECTED"] } },
      orderBy: { submitted_at: "asc" },
      select: {
        id: true,
        status: true,
        submitted_at: true,
        version: true,
        grand_total_npr: true,
        system_score: true,
        outlier_flagged: true,
        bidder: { select: { id: true, full_name: true } },
      },
    });

    return NextResponse.json({
      bids: bids.map((b) => ({
        id: b.id,
        status: b.status,
        submitted_at: b.submitted_at,
        version: b.version,
        grand_total_npr: b.grand_total_npr,
        system_score: b.system_score ? Number(b.system_score) : null,
        outlier_flagged: b.outlier_flagged,
        bidder_user_id: b.bidder.id,
        bidder_name: b.bidder.full_name,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can create bids.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, status: "PUBLISHED", bid_deadline: { gt: new Date() } },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found or bidding is closed.", 404);

    // Must have an ACCEPTED invitation or APPROVED request-to-bid
    const [invitation, bidRequest] = await Promise.all([
      prisma.bidTenderInvitation.findFirst({
        where: { tender_id: tenderId, contractor_user_id: bidUser.id, status: "ACCEPTED" },
        select: { id: true },
      }),
      prisma.bidTenderRequestToBid.findFirst({
        where: { tender_id: tenderId, contractor_user_id: bidUser.id, status: "APPROVED" },
        select: { id: true },
      }),
    ]);

    if (!invitation && !bidRequest) {
      return apiError(
        "FORBIDDEN",
        "You do not have access to bid on this tender. Accept the invitation or get your request approved first.",
        403
      );
    }

    const existingBid = await prisma.bidSubmission.findFirst({
      where: { tender_id: tenderId, bidder_user_id: bidUser.id, status: { in: ["DRAFT", "SUBMITTED", "WITHDRAWN"] } },
      select: { id: true, status: true },
    });

    if (existingBid) {
      const message =
        existingBid.status === "WITHDRAWN"
          ? "You have previously withdrawn a bid for this tender. You may not bid again."
          : "You already have an active bid for this tender.";
      return apiError("CONFLICT", message, 409);
    }

    const bid = await prisma.bidSubmission.create({
      data: { tender_id: tenderId, bidder_user_id: bidUser.id, status: "DRAFT" },
      select: { id: true, tender_id: true, status: true, created_at: true },
    });

    return NextResponse.json({ bid }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
