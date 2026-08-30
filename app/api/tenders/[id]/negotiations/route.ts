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
      return apiError("FORBIDDEN", "Access denied.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId },
      select: { id: true, client_user_id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    // Clients see all negotiations for their tender; contractors see only their own
    const where = isClient && tender.client_user_id === bidUser.id
      ? { tender_id: tenderId }
      : { tender_id: tenderId, bidder_user_id: bidUser.id };

    const negotiations = await prisma.bidNegotiation.findMany({
      where,
      orderBy: { initiated_at: "asc" },
      select: {
        id: true,
        bidder_user_id: true,
        status: true,
        deadline: true,
        original_grand_total_npr: true,
        current_proposed_total_npr: true,
        proposed_discount_percentage: true,
        initiated_at: true,
        closed_at: true,
        bidder: { select: { full_name: true } },
      },
    });

    return NextResponse.json({ negotiations });
  } catch (err) {
    return handleApiError(err);
  }
}
