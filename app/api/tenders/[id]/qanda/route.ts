import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

const postSchema = z.object({
  question_text: z.string().min(10).max(2000),
});

async function resolveContractorAccess(tenderId: number, userId: number) {
  return prisma.tender.findFirst({
    where: {
      id: tenderId,
      status: "PUBLISHED",
      OR: [
        { tender_type: "PUBLIC" },
        { invitations: { some: { contractor_user_id: userId, status: "ACCEPTED" } } },
        { requestsToBid: { some: { contractor_user_id: userId, status: "APPROVED" } } },
      ],
    },
    select: { id: true, qanda_deadline: true, client_user_id: true, title: true },
  });
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    if (procurementRoles.includes("CONTRACTOR")) {
      const tender = await resolveContractorAccess(tenderId, bidUser.id);
      if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

      const questions = await prisma.bidQandAQuestion.findMany({
        where: { tender_id: tenderId, status: "ANSWERED" },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          question_text: true,
          status: true,
          is_public: true,
          created_at: true,
          answers: {
            select: { id: true, answer_text: true, created_at: true },
            orderBy: { created_at: "asc" },
          },
        },
      });

      return NextResponse.json({ questions });
    }

    if (procurementRoles.includes("CLIENT")) {
      const tender = await prisma.tender.findFirst({
        where: { id: tenderId, client_user_id: bidUser.id },
        select: { id: true },
      });
      if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

      const questions = await prisma.bidQandAQuestion.findMany({
        where: { tender_id: tenderId },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          question_text: true,
          status: true,
          is_public: true,
          created_at: true,
          askedBy: { select: { id: true, full_name: true } },
          answers: {
            select: { id: true, answer_text: true, created_at: true, answeredBy: { select: { id: true, full_name: true } } },
            orderBy: { created_at: "asc" },
          },
        },
      });

      return NextResponse.json({
        questions: questions.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          status: q.status,
          is_public: q.is_public,
          created_at: q.created_at,
          questioner: { id: q.askedBy.id, full_name: q.askedBy.full_name },
          answers: q.answers.map((a) => ({
            id: a.id,
            answer_text: a.answer_text,
            created_at: a.created_at,
            answered_by: { id: a.answeredBy.id, full_name: a.answeredBy.full_name },
          })),
        })),
      });
    }

    return apiError("FORBIDDEN", "Access denied.", 403);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can submit questions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await resolveContractorAccess(tenderId, bidUser.id);
    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    if (tender.qanda_deadline !== null && tender.qanda_deadline <= new Date()) {
      return apiError("CONFLICT", "Q&A is closed for this tender.", 409);
    }

    let body: unknown;
    try { body = await request.json(); } catch { return apiError("VALIDATION_ERROR", "Invalid JSON.", 400); }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const question = await prisma.bidQandAQuestion.create({
      data: {
        tender_id: tenderId,
        asked_by_user_id: bidUser.id,
        question_text: parsed.data.question_text,
        status: "PENDING",
        is_public: false,
      },
      select: { id: true, question_text: true, status: true, created_at: true },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
