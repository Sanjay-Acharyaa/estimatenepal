import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES = ["FIXED", "VARIABLE", "RENEGOTIATION"];

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can set price escalation.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as {
      price_escalation_type: string;
      price_escalation_trigger_percentage?: number;
    };

    if (!VALID_TYPES.includes(body.price_escalation_type)) {
      return apiError("VALIDATION_ERROR", `price_escalation_type must be one of: ${VALID_TYPES.join(", ")}`, 400);
    }

    const contract = await prisma.bidContract.findFirst({
      where: { tender_id: tenderId, tender: { client_user_id: bidUser.id } },
      select: { id: true },
    });

    if (!contract) return apiError("NOT_FOUND", "Contract not found.", 404);

    const updated = await prisma.bidContract.update({
      where: { id: contract.id },
      data: {
        price_escalation_type: body.price_escalation_type,
        price_escalation_trigger_percentage: body.price_escalation_trigger_percentage ?? null,
      },
      select: { id: true, price_escalation_type: true, price_escalation_trigger_percentage: true },
    });

    return NextResponse.json({ contract: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
