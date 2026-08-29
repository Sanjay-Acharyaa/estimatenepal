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
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can watch tenders.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("VALIDATION_ERROR", "Invalid tender ID.", 400);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found or not currently published.", 422);

    const existing = await prisma.bidTenderWatchlist.findUnique({
      where: { user_id_tender_id: { user_id: bidUser.id, tender_id: tenderId } },
      select: { id: true },
    });
    if (existing) return apiError("CONFLICT", "You are already watching this tender.", 409);

    await prisma.bidTenderWatchlist.create({ data: { user_id: bidUser.id, tender_id: tenderId } });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can manage watches.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("VALIDATION_ERROR", "Invalid tender ID.", 400);

    const deleted = await prisma.bidTenderWatchlist.deleteMany({
      where: { user_id: bidUser.id, tender_id: tenderId },
    });

    if (deleted.count === 0) return apiError("NOT_FOUND", "Watch not found.", 404);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
