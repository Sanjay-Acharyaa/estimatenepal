import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; negId: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can close a negotiation.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, negId } = await params;
    const tenderId = parseInt(id, 10);
    const negotiationId = parseInt(negId, 10);
    if (isNaN(tenderId) || isNaN(negotiationId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const neg = await prisma.bidNegotiation.findFirst({
      where: { id: negotiationId, tender_id: tenderId, status: "ACTIVE" },
    });
    if (!neg) return apiError("NOT_FOUND", "Active negotiation not found.", 404);

    await prisma.bidNegotiation.update({
      where: { id: negotiationId },
      data: { status: "CLOSED_NO_AGREEMENT", closed_at: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
