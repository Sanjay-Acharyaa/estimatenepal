import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; negId: string }> };

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");
    if (!isClient && !isContractor) return apiError("FORBIDDEN", "Access denied.", 403);

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, negId } = await params;
    const tenderId = parseInt(id, 10);
    const negotiationId = parseInt(negId, 10);
    if (isNaN(tenderId) || isNaN(negotiationId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId },
      select: { client_user_id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const neg = await prisma.bidNegotiation.findFirst({
      where: { id: negotiationId, tender_id: tenderId },
      select: { id: true, bidder_user_id: true, status: true },
    });
    if (!neg) return apiError("NOT_FOUND", "Negotiation not found.", 404);

    const isOwner =
      (isClient && tender.client_user_id === bidUser.id) ||
      (isContractor && neg.bidder_user_id === bidUser.id);
    if (!isOwner) return apiError("FORBIDDEN", "Access denied.", 403);
    if (neg.status !== "ACTIVE") return apiError("CONFLICT", "This negotiation is closed.", 409);

    const body = await request.json();
    const { proposed_discount_percentage, current_proposed_total_npr } = body as {
      proposed_discount_percentage?: number;
      current_proposed_total_npr?: number;
    };

    if (proposed_discount_percentage === undefined || proposed_discount_percentage < 0 || proposed_discount_percentage > 100) {
      return apiError("VALIDATION_ERROR", "Discount must be between 0 and 100.", 400);
    }
    if (current_proposed_total_npr === undefined || current_proposed_total_npr < 0) {
      return apiError("VALIDATION_ERROR", "Proposed total is required and must be >= 0.", 400);
    }

    const updated = await prisma.bidNegotiation.update({
      where: { id: negotiationId },
      data: {
        proposed_discount_percentage,
        current_proposed_total_npr,
      },
    });

    return NextResponse.json({ negotiation: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
