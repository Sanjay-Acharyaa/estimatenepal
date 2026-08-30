import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { uploadBuffer, getDownloadUrl, completionCertKey } from "@/lib/upload";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    if (!procurementRoles.includes("CLIENT")) {
      return apiError("FORBIDDEN", "Only clients can download the completion certificate.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: { id: tenderId, client_user_id: bidUser.id, status: "COMPLETED" },
      select: {
        id: true,
        title: true,
        reference_number: true,
        awarded_amount_npr: true,
        awarded_at: true,
        client: { select: { full_name: true } },
        submissions: {
          where: { status: "AWARDED" },
          take: 1,
          select: { bidder: { select: { full_name: true } } },
        },
        completionRequests: {
          where: { status: "APPROVED" },
          orderBy: { approved_at: "desc" },
          take: 1,
          select: { approved_at: true },
        },
        contract: {
          select: { dlp_months: true, dlp_end_date: true },
        },
      },
    });

    if (!tender) return apiError("NOT_FOUND", "Tender not found or not COMPLETED.", 404);

    const certKey = completionCertKey(tenderId);
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    const completedAt = tender.completionRequests[0]?.approved_at ?? new Date();
    const contractor = tender.submissions[0]?.bidder.full_name ?? "ठेकेदार";
    const awardedAmount = tender.awarded_amount_npr
      ? `NPR ${Number(tender.awarded_amount_npr).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : "";

    const html = `<!DOCTYPE html>
<html lang="ne">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Noto Sans Devanagari', Arial, sans-serif; text-align: center; padding: 60px 80px; }
  h1 { font-size: 28px; color: #1a3c6b; margin-bottom: 8px; }
  .subtitle { font-size: 16px; color: #555; margin-bottom: 40px; }
  .cert-box { border: 4px double #1a3c6b; padding: 40px; border-radius: 8px; }
  .field { margin: 16px 0; font-size: 15px; line-height: 1.8; }
  .label { font-weight: bold; color: #333; }
  .seal { margin-top: 60px; font-size: 12px; color: #888; }
  .signature-row { display: flex; justify-content: space-around; margin-top: 60px; }
  .sig-box { text-align: center; border-top: 1px solid #333; width: 200px; padding-top: 8px; }
</style>
</head>
<body>
<div class="cert-box">
  <h1>कार्य पूर्णता प्रमाणपत्र</h1>
  <div class="subtitle">Certificate of Practical Completion</div>

  <div class="field">यो प्रमाणित गरिन्छ कि</div>
  <div class="field"><span class="label">परियोजना:</span> ${tender.title}</div>
  <div class="field"><span class="label">सन्दर्भ:</span> ${tender.reference_number}</div>
  <div class="field"><span class="label">ठेकेदार:</span> ${contractor}</div>
  ${awardedAmount ? `<div class="field"><span class="label">ठेक्का रकम:</span> ${awardedAmount}</div>` : ""}
  <div class="field"><span class="label">पूर्णता मिति:</span> ${completedAt.toLocaleDateString("ne-NP")}</div>
  ${tender.contract?.dlp_end_date ? `<div class="field"><span class="label">DLP समाप्ति मिति:</span> ${tender.contract.dlp_end_date.toLocaleDateString("ne-NP")}</div>` : ""}

  <p style="margin-top:30px;">माथि उल्लिखित परियोजनाको सम्पूर्ण कार्य स्वीकृत मापदण्ड अनुसार सम्पन्न भएको छ।</p>

  <div class="signature-row">
    <div class="sig-box">
      <strong>ग्राहकको हस्ताक्षर</strong><br>${tender.client.full_name}
    </div>
    <div class="sig-box">
      <strong>ठेकेदारको हस्ताक्षर</strong><br>${contractor}
    </div>
  </div>

  <div class="seal">मिति: ${new Date().toLocaleDateString("ne-NP")} | EstimateNepal</div>
</div>
</body>
</html>`;

    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4", margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
    await browser.close();

    await uploadBuffer(certKey, Buffer.from(pdfBuffer), "application/pdf");
    const url = await getDownloadUrl(certKey);
    return NextResponse.json({ url });
  } catch (err) {
    return handleApiError(err);
  }
}
