import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { sendEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can request contract changes.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as { clause_reference?: string; comment_text: string };
    if (!body.comment_text?.trim()) {
      return apiError("VALIDATION_ERROR", "comment_text is required.", 400);
    }

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: {
        id: true,
        title: true,
        reference_number: true,
        contract: { select: { id: true, status: true } },
        submissions: {
          where: { status: "AWARDED" },
          take: 1,
          select: { bidder: { select: { full_name: true, email: true } } },
        },
      },
    });

    if (!tender || !tender.contract) return apiError("NOT_FOUND", "Contract not found.", 404);
    if (tender.contract.status !== "UNDER_REVIEW") {
      return apiError("CONFLICT", "Contract must be UNDER_REVIEW to request changes.", 409);
    }

    await prisma.$transaction([
      prisma.bidContractComment.create({
        data: {
          contract_id: tender.contract.id,
          clause_reference: body.clause_reference ?? null,
          comment_text: body.comment_text.trim(),
          commenter_user_id: bidUser.id,
        },
      }),
      prisma.bidContract.update({
        where: { id: tender.contract.id },
        data: { status: "DRAFT" },
      }),
    ]);

    const contractor = tender.submissions[0]?.bidder;
    if (contractor) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      sendEmail({
        to: contractor.email,
        subject: `ठेक्का परिवर्तन अनुरोध: ${tender.title}`,
        html: `<p>प्रिय ${contractor.full_name},</p>
<p>ग्राहकले <strong>${tender.title}</strong> को ठेक्का मस्यौदामा परिवर्तनको अनुरोध गरेका छन्।</p>
<p>टिप्पणी: ${body.comment_text}</p>
<p><a href="${appUrl}/tenders/${tenderId}/contract">ठेक्का हेर्नुहोस्</a></p>`,
      }).catch((err: unknown) => console.error("[contract-changes-email]", err));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
