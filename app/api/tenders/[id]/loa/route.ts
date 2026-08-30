import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { buildLoaHtml, generateLoaPdf } from "@/lib/loa";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");

    if (!isClient && !isContractor) {
      return apiError("FORBIDDEN", "Only clients and contractors can access the Letter of Award.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId },
      select: {
        id: true,
        title: true,
        reference_number: true,
        status: true,
        client_user_id: true,
        awarded_bidder_id: true,
        awarded_amount_npr: true,
        awarded_at: true,
        client: { select: { full_name: true } },
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
    if (tender.status !== "AWARDED") return apiError("CONFLICT", "Letter of Award is only available after the tender has been awarded.", 409);

    const isAuthorized =
      (isClient && tender.client_user_id === bidUser.id) ||
      (isContractor && tender.awarded_bidder_id === bidUser.id);

    if (!isAuthorized) return apiError("FORBIDDEN", "Access denied.", 403);

    const awardedBid = await prisma.bidSubmission.findFirst({
      where: { tender_id: tenderId, status: "AWARDED" },
      select: { id: true, bidder: { select: { full_name: true } } },
    });

    if (!awardedBid) return apiError("NOT_FOUND", "Awarded bid not found.", 404);

    const awardedAmount = tender.awarded_amount_npr
      ? `NPR ${Number(tender.awarded_amount_npr).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : "As per bid submission";

    const awardedAt = tender.awarded_at
      ? new Date(tender.awarded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

    const html = buildLoaHtml({
      tenderTitle: tender.title,
      referenceNumber: tender.reference_number ?? `TDR-${tenderId}`,
      bidderName: awardedBid.bidder.full_name,
      awardedAmount,
      awardedAt,
      clientOrgName: tender.client.full_name,
    });

    const pdfBuffer = await generateLoaPdf(html);

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="LOA-${tender.reference_number ?? tenderId}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
