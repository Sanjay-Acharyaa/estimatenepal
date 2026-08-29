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
      return apiError("FORBIDDEN", "Only clients can publish tenders.", 403);
    }

    const bidUser = await getOrCreateBidUser(
      token.email as string,
      token.name as string,
      procurementRoles
    );

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: {
        id: true,
        status: true,
        bid_deadline: true,
        _count: { select: { boqChapters: true } },
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (tender.status !== "DRAFT") {
      return apiError("CONFLICT", "Only DRAFT tenders can be published.", 409);
    }
    if (new Date(tender.bid_deadline) <= new Date()) {
      return apiError("VALIDATION_ERROR", "Bid deadline must be in the future.", 400);
    }
    if (tender._count.boqChapters === 0) {
      return apiError("VALIDATION_ERROR", "Tender must have at least one BOQ chapter before publishing.", 400);
    }

    const published = await prisma.tender.update({
      where: { id: tenderId },
      data: { status: "PUBLISHED" },
      select: {
        id: true,
        reference_number: true,
        title: true,
        status: true,
        bid_deadline: true,
      },
    });

    return NextResponse.json({ tender: published });
  } catch (err) {
    return handleApiError(err);
  }
}
