import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; bidId: string }> };

const schema = z.object({ note: z.string().max(1000).nullable() });

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can add notes.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("NOT_FOUND", "Not found.", 404);

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);

    const [tender, bid] = await Promise.all([
      prisma.tender.findFirst({ where: { id: tenderId, client_user_id: bidUser.id }, select: { id: true } }),
      prisma.bidSubmission.findFirst({ where: { id: bidIdInt, tender_id: tenderId }, select: { id: true } }),
    ]);

    if (!tender || !bid) return apiError("NOT_FOUND", "Bid not found.", 404);

    const updated = await prisma.bidSubmission.update({
      where: { id: bidIdInt },
      data: { client_note: parsed.data.note },
      select: { id: true, client_note: true },
    });

    return NextResponse.json({ bid: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
