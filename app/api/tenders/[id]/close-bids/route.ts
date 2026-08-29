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
      return apiError("FORBIDDEN", "Only clients can close bidding.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true, status: true, bid_deadline: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    if (tender.status !== "PUBLISHED") {
      return apiError("CONFLICT", "Only published tenders can be closed for bidding.", 409);
    }

    if (tender.bid_deadline > new Date()) {
      return apiError("CONFLICT", "Bid deadline has not yet passed.", 409);
    }

    const updated = await prisma.tender.update({
      where: { id: tenderId },
      data: { status: "UNDER_REVIEW" },
      select: { id: true, status: true },
    });

    return NextResponse.json({ tender: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
