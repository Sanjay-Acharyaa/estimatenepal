import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string; questionId: string }> };

const postSchema = z.object({
  answer_text: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can answer questions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, questionId } = await params;
    const tenderId = parseInt(id, 10);
    const questionIdInt = parseInt(questionId, 10);
    if (isNaN(tenderId) || isNaN(questionIdInt)) {
      return apiError("VALIDATION_ERROR", "Invalid ID.", 400);
    }

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const question = await prisma.bidQandAQuestion.findFirst({
      where: { id: questionIdInt, tender_id: tenderId },
      select: { id: true, status: true },
    });
    if (!question) return apiError("NOT_FOUND", "Question not found.", 404);

    if (question.status !== "PENDING") {
      return apiError(
        "CONFLICT",
        question.status === "ANSWERED"
          ? "This question has already been answered."
          : "This question has been rejected and cannot be answered.",
        409
      );
    }

    const [updatedQuestion, answer] = await prisma.$transaction([
      prisma.bidQandAQuestion.update({
        where: { id: question.id },
        data: { status: "ANSWERED", is_public: true },
        select: { id: true, status: true, is_public: true },
      }),
      prisma.bidQandAAnswer.create({
        data: {
          question_id: question.id,
          answered_by_user_id: bidUser.id,
          answer_text: parsed.data.answer_text,
        },
        select: { id: true, answer_text: true, created_at: true },
      }),
    ]);

    return NextResponse.json({ question: updatedQuestion, answer }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
