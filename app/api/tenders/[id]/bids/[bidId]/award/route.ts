import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { sendEmail } from "@/lib/email";
import { buildLoaHtml, generateLoaPdf } from "@/lib/loa";

type Params = { params: Promise<{ id: string; bidId: string }> };

const AWARDABLE: string[] = ["SUBMITTED", "SHORTLISTED"];

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can award bids.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id, bidId } = await params;
    const tenderId = parseInt(id, 10);
    const bidIdInt = parseInt(bidId, 10);
    if (isNaN(tenderId) || isNaN(bidIdInt)) return apiError("NOT_FOUND", "Not found.", 404);

    const [tender, bid] = await Promise.all([
      prisma.tender.findFirst({
        where: { id: tenderId, client_user_id: bidUser.id },
        select: { id: true, title: true, reference_number: true, client: { select: { full_name: true } } },
      }),
      prisma.bidSubmission.findFirst({
        where: { id: bidIdInt, tender_id: tenderId },
        select: {
          id: true,
          status: true,
          bidder_user_id: true,
          total_with_vat_npr: true,
          grand_total_npr: true,
          bidder: { select: { full_name: true, email: true } },
        },
      }),
    ]);

    if (!tender || !bid) return apiError("NOT_FOUND", "Bid not found.", 404);

    if (!AWARDABLE.includes(bid.status)) {
      return apiError("CONFLICT", `Only submitted or shortlisted bids can be awarded. Current status: ${bid.status}.`, 409);
    }

    const awardedAt = new Date();
    const awardedAmount = bid.total_with_vat_npr ?? bid.grand_total_npr;

    const [awardedBid, , updatedTender] = await prisma.$transaction([
      prisma.bidSubmission.update({
        where: { id: bidIdInt },
        data: { status: "AWARDED" },
        select: { id: true, status: true, updated_at: true },
      }),
      prisma.bidSubmission.updateMany({
        where: { tender_id: tenderId, id: { not: bidIdInt }, status: { in: ["SUBMITTED", "SHORTLISTED"] } },
        data: { status: "NOT_AWARDED" },
      }),
      prisma.tender.update({
        where: { id: tenderId },
        data: {
          status: "AWARDED",
          awarded_bidder_id: bid.bidder_user_id,
          awarded_amount_npr: awardedAmount,
          awarded_at: awardedAt,
        },
        select: { id: true, status: true, awarded_at: true },
      }),
    ]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    const amountFormatted = awardedAmount
      ? `NPR ${Number(awardedAmount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : "As per bid submission";

    const awardedAtFormatted = awardedAt.toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
    });

    // Fire-and-forget: generate LOA PDF and email as attachment
    ;(async () => {
      try {
        const html = buildLoaHtml({
          tenderTitle: tender.title,
          referenceNumber: tender.reference_number ?? `TDR-${tenderId}`,
          bidderName: bid.bidder.full_name,
          awardedAmount: amountFormatted || "As per bid submission",
          awardedAt: awardedAtFormatted,
          clientOrgName: tender.client.full_name,
        })
        const pdfBuffer = await generateLoaPdf(html)
        await sendEmail({
          to: bid.bidder.email,
          subject: `Letter of Award: ${tender.title}`,
          html: `<p>Dear ${bid.bidder.full_name},</p>
<p>Congratulations! Your bid for <strong>${tender.title}</strong> (${tender.reference_number ?? ""}) has been awarded${amountFormatted ? ` at <strong>${amountFormatted}</strong>` : ""}.</p>
<p>Please find the Letter of Award attached to this email.</p>
<p><a href="${appUrl}/tenders/${tenderId}">View tender details</a></p>`,
          attachments: [{ filename: `LOA-${tender.reference_number ?? tenderId}.pdf`, content: pdfBuffer }],
        })
      } catch (err) {
        console.error("[award-loa-email]", err instanceof Error ? err.message : err)
      }
    })()

    return NextResponse.json({ bid: awardedBid, tender: updatedTender });
  } catch (err) {
    return handleApiError(err);
  }
}
