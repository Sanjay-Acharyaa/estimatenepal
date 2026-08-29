import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

async function generateLoaPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function buildLoaHtml(data: {
  tenderTitle: string;
  referenceNumber: string;
  bidderName: string;
  awardedAmount: string;
  awardedAt: string;
  clientOrgName: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; color: #111; line-height: 1.6; }
  h1 { font-size: 18pt; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 11pt; color: #555; margin-bottom: 32px; }
  .label { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  td { padding: 8px 12px; border: 1px solid #ddd; }
  td:first-child { background: #f5f5f5; font-weight: bold; width: 200px; }
  .footer { margin-top: 60px; }
  .sig-line { border-top: 1px solid #111; width: 220px; margin-top: 60px; padding-top: 4px; font-size: 10pt; }
</style>
</head>
<body>
<h1>Letter of Award</h1>
<p class="subtitle">${data.referenceNumber}</p>

<p>Date: ${data.awardedAt}</p>
<p>To: <strong>${data.bidderName}</strong></p>

<p>Dear ${data.bidderName},</p>

<p>We are pleased to inform you that your bid for the following tender has been evaluated and selected for award:</p>

<table>
  <tr><td>Tender Title</td><td>${data.tenderTitle}</td></tr>
  <tr><td>Reference Number</td><td>${data.referenceNumber}</td></tr>
  <tr><td>Awarded Amount</td><td>${data.awardedAmount}</td></tr>
  <tr><td>Award Date</td><td>${data.awardedAt}</td></tr>
</table>

<p>You are hereby requested to:</p>
<ol>
  <li>Acknowledge receipt of this Letter of Award within <strong>7 days</strong>.</li>
  <li>Submit performance security as per tender conditions.</li>
  <li>Sign the formal contract agreement at the earliest convenience.</li>
</ol>

<p>Please contact us to schedule the contract signing. Congratulations on your successful bid.</p>

<div class="footer">
  <p>Yours sincerely,</p>
  <div class="sig-line">${data.clientOrgName}</div>
</div>
</body>
</html>`;
}

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
