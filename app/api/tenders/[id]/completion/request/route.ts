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
      return apiError("FORBIDDEN", "Only contractors can submit completion requests.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const body = await request.json() as { completion_notes?: string };

    const tender = await prisma.tender.findFirst({
      where: {
        id: tenderId,
        submissions: { some: { bidder_user_id: bidUser.id, status: "AWARDED" } },
      },
      select: {
        id: true,
        title: true,
        reference_number: true,
        client: { select: { full_name: true, email: true } },
        snagItems: { select: { status: true } },
        completionRequests: {
          where: { status: "PENDING" },
          select: { id: true },
        },
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);

    const openSnags = tender.snagItems.filter((s) => !["CLOSED", "REJECTED"].includes(s.status));
    if (openSnags.length > 0) {
      return apiError("CONFLICT", `All snag items must be CLOSED or REJECTED before requesting completion. ${openSnags.length} open snag(s) remaining.`, 409);
    }

    if (tender.completionRequests.length > 0) {
      return apiError("CONFLICT", "A completion request is already pending.", 409);
    }

    const lastRequest = await prisma.bidCompletionRequest.findFirst({
      where: { tender_id: tenderId },
      orderBy: { attempt_number: "desc" },
      select: { attempt_number: true },
    });

    const attemptNumber = (lastRequest?.attempt_number ?? 0) + 1;

    const req = await prisma.bidCompletionRequest.create({
      data: {
        tender_id: tenderId,
        submitted_by_user_id: bidUser.id,
        attempt_number: attemptNumber,
        completion_notes: body.completion_notes?.trim() ?? null,
        status: "PENDING",
      },
      select: { id: true, attempt_number: true, status: true, created_at: true },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    sendEmail({
      to: tender.client.email,
      subject: `कार्य पूर्णताको अनुरोध: ${tender.title}`,
      html: `<p>प्रिय ${tender.client.full_name},</p>
<p>ठेकेदारले <strong>${tender.title}</strong> (${tender.reference_number}) को कार्य पूर्ण भएको अनुरोध पेश गरेका छन्।</p>
<p><a href="${appUrl}/client/tenders/${tenderId}/completion">अनुरोध समीक्षा गर्नुहोस्</a></p>`,
    }).catch((err: unknown) => console.error("[completion-req-email]", err));

    return NextResponse.json({ completion_request: req }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
