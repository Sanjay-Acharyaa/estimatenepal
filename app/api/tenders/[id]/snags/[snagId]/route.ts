import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; snagId: string }> };

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
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
    const { id, snagId } = await params;
    const tenderId = parseInt(id, 10);
    const snagIdInt = parseInt(snagId, 10);
    if (isNaN(tenderId) || isNaN(snagIdInt)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as {
      status?: string;
      fixed_notes?: string;
      rejection_reason?: string;
    };

    const snag = await prisma.bidSnagItem.findFirst({
      where: { id: snagIdInt, tender_id: tenderId },
      select: { id: true, status: true },
    });

    if (!snag) return apiError("NOT_FOUND", "Snag item not found.", 404);

    // Validate state machine transitions
    if (isClient) {
      const clientTransitions: Record<string, string[]> = {
        FIXED: ["CLOSED", "REJECTED"],
      };
      if (!body.status || !clientTransitions[snag.status]?.includes(body.status)) {
        return apiError("CONFLICT", `Client cannot transition snag from ${snag.status} to ${body.status ?? "(none)"}.`, 409);
      }
    } else {
      // Contractor
      const contractorTransitions: Record<string, string[]> = {
        OPEN: ["IN_PROGRESS", "FIXED"],
        IN_PROGRESS: ["FIXED"],
      };
      if (!body.status || !contractorTransitions[snag.status]?.includes(body.status)) {
        return apiError("CONFLICT", `Contractor cannot transition snag from ${snag.status} to ${body.status ?? "(none)"}.`, 409);
      }
    }

    const updateData: Record<string, unknown> = { status: body.status };
    if (body.fixed_notes !== undefined) updateData.fixed_notes = body.fixed_notes;
    if (body.rejection_reason !== undefined) updateData.rejection_reason = body.rejection_reason;

    const updated = await prisma.bidSnagItem.update({
      where: { id: snagIdInt },
      data: updateData,
      select: {
        id: true,
        item_number: true,
        status: true,
        fixed_notes: true,
        rejection_reason: true,
        updated_at: true,
      },
    });

    return NextResponse.json({ snag: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
