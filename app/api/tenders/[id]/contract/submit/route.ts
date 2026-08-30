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
    if (!procurementRoles.includes("CONTRACTOR")) {
      return apiError("FORBIDDEN", "Only contractors can submit contracts.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const contract = await prisma.bidContract.findFirst({
      where: { tender_id: tenderId, winning_bid: { bidder_user_id: bidUser.id } },
      select: {
        id: true,
        status: true,
        contract_text: true,
        current_draft_version: true,
        tender: {
          select: {
            id: true,
            title: true,
            reference_number: true,
            client: { select: { full_name: true, email: true } },
          },
        },
      },
    });

    if (!contract) return apiError("NOT_FOUND", "Contract not found.", 404);
    if (contract.status !== "DRAFT") {
      return apiError("CONFLICT", "Contract must be in DRAFT to submit.", 409);
    }

    const nextVersion = contract.current_draft_version + 1;

    const [updated] = await prisma.$transaction([
      prisma.bidContract.update({
        where: { id: contract.id },
        data: { status: "UNDER_REVIEW", current_draft_version: nextVersion },
        select: { id: true, status: true, current_draft_version: true, updated_at: true },
      }),
      prisma.bidContractRevision.create({
        data: {
          contract_id: contract.id,
          revision_number: nextVersion,
          content: contract.contract_text,
          submitted_by_user_id: bidUser.id,
        },
      }),
    ]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    sendEmail({
      to: contract.tender.client.email,
      subject: `ठेक्का समीक्षाको लागि पेश: ${contract.tender.title}`,
      html: `<p>प्रिय ${contract.tender.client.full_name},</p>
<p>ठेकेदारले <strong>${contract.tender.title}</strong> को ठेक्का मस्यौदा समीक्षाको लागि पेश गरेका छन्।</p>
<p><a href="${appUrl}/client/tenders/${tenderId}/contract">ठेक्का समीक्षा गर्नुहोस्</a></p>`,
    }).catch((err: unknown) => console.error("[contract-submit-email]", err));

    return NextResponse.json({ contract: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
