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
      return apiError("FORBIDDEN", "Only clients can approve completion.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id },
      select: {
        id: true,
        title: true,
        reference_number: true,
        contract: {
          select: { id: true, dlp_months: true },
        },
        completionRequests: {
          where: { status: "PENDING" },
          orderBy: { created_at: "desc" },
          take: 1,
          select: { id: true, attempt_number: true },
        },
        submissions: {
          where: { status: "AWARDED" },
          take: 1,
          select: { bidder: { select: { full_name: true, email: true } }, bidder_user_id: true },
        },
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (!tender.completionRequests[0]) {
      return apiError("CONFLICT", "No pending completion request found.", 409);
    }

    const now = new Date();
    const dlpMonths = tender.contract?.dlp_months ?? 12;
    const dlpEnd = new Date(now);
    dlpEnd.setMonth(dlpEnd.getMonth() + dlpMonths);

    const pendingReq = tender.completionRequests[0];
    const awardedBid = tender.submissions[0];

    await prisma.$transaction(async (tx) => {
      await tx.bidCompletionRequest.update({
        where: { id: pendingReq.id },
        data: { status: "APPROVED", approved_at: now },
      });

      await tx.tender.update({
        where: { id: tenderId },
        data: { status: "COMPLETED" },
      });

      if (tender.contract) {
        await tx.bidContract.update({
          where: { id: tender.contract.id },
          data: { dlp_start_date: now, dlp_end_date: dlpEnd },
        });
      }

      // Open rating window if both parties haven't rated yet
      const ratingWindowDays = 30;
      const ratingWindowCloses = new Date(now);
      ratingWindowCloses.setDate(ratingWindowCloses.getDate() + ratingWindowDays);

      if (awardedBid) {
        await tx.bidRating.createMany({
          data: [
            {
              tender_id: tenderId,
              rater_user_id: bidUser.id,
              rated_user_id: awardedBid.bidder_user_id,
              rating_direction: "CLIENT_RATES_CONTRACTOR",
              score_1: 0,
              score_2: 0,
              score_3: 0,
              score_4: 0,
              score_5: 0,
              average_score: 0,
              window_opened_at: now,
              window_closes_at: ratingWindowCloses,
              is_visible: false,
              submitted_at: now,
            },
            {
              tender_id: tenderId,
              rater_user_id: awardedBid.bidder_user_id,
              rated_user_id: bidUser.id,
              rating_direction: "CONTRACTOR_RATES_CLIENT",
              score_1: 0,
              score_2: 0,
              score_3: 0,
              score_4: 0,
              score_5: 0,
              average_score: 0,
              window_opened_at: now,
              window_closes_at: ratingWindowCloses,
              is_visible: false,
              submitted_at: now,
            },
          ],
          skipDuplicates: true,
        });
      }
    });

    if (awardedBid) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      sendEmail({
        to: awardedBid.bidder.email,
        subject: `कार्य पूर्णता स्वीकृत: ${tender.title}`,
        html: `<p>प्रिय ${awardedBid.bidder.full_name},</p>
<p><strong>${tender.title}</strong> (${tender.reference_number}) को कार्य पूर्णता स्वीकृत भयो।</p>
<p>DLP अवधि: ${dlpMonths} महिना (${dlpEnd.toLocaleDateString("ne-NP")} सम्म)</p>
<p>कृपया परियोजनाको मूल्यांकन प्रदान गर्नुहोस्।</p>
<p><a href="${appUrl}/tenders/${tenderId}/ratings">मूल्यांकन दिनुहोस्</a></p>`,
      }).catch((err: unknown) => console.error("[completion-approve-email]", err));
    }

    return NextResponse.json({ ok: true, dlp_end: dlpEnd });
  } catch (err) {
    return handleApiError(err);
  }
}
