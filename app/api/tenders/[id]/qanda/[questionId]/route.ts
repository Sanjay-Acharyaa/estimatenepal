import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; questionId: string }> };

const patchSchema = z.object({
  status: z.literal("REJECTED"),
});

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can moderate questions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, questionId } = await params;
    const tenderId = parseInt(id, 10);
    const questionIdInt = parseInt(questionId, 10);
    if (isNaN(tenderId) || isNaN(questionIdInt)) {
      return apiError("VALIDATION_ERROR", "Invalid ID.", 400);
    }

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const question = await prisma.bidQandAQuestion.findFirst({
      where: { id: questionIdInt, tender_id: tenderId },
      select: { id: true, status: true },
    });
    if (!question) return apiError("NOT_FOUND", "Question not found.", 404);

    if (question.status !== "PENDING") {
      return apiError("CONFLICT", "Only pending questions can be rejected.", 409);
    }

    const updated = await prisma.bidQandAQuestion.update({
      where: { id: question.id },
      data: { status: "REJECTED" },
      select: { id: true, status: true },
    });

    return NextResponse.json({ question: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
