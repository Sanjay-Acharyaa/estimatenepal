import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { uploadBuffer, getDownloadUrl, contractPdfKey } from "@/lib/upload";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const isClient = procurementRoles.includes("CLIENT");
    const isContractor = procurementRoles.includes("CONTRACTOR");
    const isConsultant = procurementRoles.includes("CONSULTANT");

    if (!isClient && !isContractor && !isConsultant) {
      return apiError("FORBIDDEN", "Insufficient permissions.", 403);
    }

    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);
    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Not found.", 404);

    const tender = await prisma.tender.findFirst({
      where: {
        id: tenderId,
        ...(isClient ? { client_user_id: bidUser.id } : {}),
        ...(isContractor ? { submissions: { some: { bidder_user_id: bidUser.id, status: "AWARDED" } } } : {}),
      },
      select: {
        id: true,
        title: true,
        reference_number: true,
        awarded_amount_npr: true,
        contract: {
          select: {
            id: true,
            contract_text: true,
            pdf_url: true,
            pdf_generated_at: true,
            updated_at: true,
            status: true,
            client_signed_at: true,
            contractor_signed_at: true,
            mobilization_advance_percentage: true,
            retention_percentage: true,
            dlp_months: true,
            completion_start_date: true,
            completion_end_date: true,
          },
        },
        client: { select: { full_name: true } },
        submissions: {
          where: { status: "AWARDED" },
          take: 1,
          select: {
            bidder: { select: { full_name: true } },
            lineItems: {
              select: {
                boqItem: { select: { description: true, unit: true, client_quantity: true } },
                bidder_rate_npr: true,
                amount_npr: true,
              },
            },
          },
        },
      },
    });

    if (!tender?.contract) return apiError("NOT_FOUND", "Contract not found.", 404);

    const contract = tender.contract;
    const pdfKey = contractPdfKey(tenderId);

    // Serve cached PDF if still fresh (generated after last contract update)
    if (contract.pdf_url && contract.pdf_generated_at && contract.pdf_generated_at > contract.updated_at) {
      const url = await getDownloadUrl(pdfKey);
      return NextResponse.json({ url });
    }

    // Generate new PDF
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    const awardedBid = tender.submissions[0];
    const boqRows = awardedBid?.lineItems
      .map(
        (li) =>
          `<tr>
          <td>${li.boqItem.description}</td>
          <td>${li.boqItem.unit}</td>
          <td>${Number(li.boqItem.client_quantity ?? 0).toFixed(2)}</td>
          <td>NPR ${Number(li.bidder_rate_npr).toLocaleString("en-IN")}</td>
          <td>NPR ${Number(li.amount_npr).toLocaleString("en-IN")}</td>
        </tr>`
      )
      .join("") ?? "";

    const html = `<!DOCTYPE html>
<html lang="ne">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Noto Sans Devanagari', Arial, sans-serif; font-size: 12px; color: #111; margin: 40px; }
  h1 { text-align: center; font-size: 20px; }
  h2 { font-size: 14px; margin-top: 24px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .contract-body { white-space: pre-wrap; line-height: 1.8; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  .signature-row { display: flex; justify-content: space-between; margin-top: 60px; }
  .sig-box { width: 45%; border-top: 1px solid #333; padding-top: 8px; }
</style>
</head>
<body>
<h1>ठेक्का सम्झौता पत्र</h1>
<div class="meta">
  <div>सन्दर्भ: ${tender.reference_number}</div>
  <div>परियोजना: ${tender.title}</div>
</div>
<div class="contract-body">${contract.contract_text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>

<h2>संलग्न: बिल अफ क्वान्टिटीज (BOQ)</h2>
<table>
  <thead>
    <tr><th>विवरण</th><th>एकाइ</th><th>परिमाण</th><th>दर (NPR)</th><th>रकम (NPR)</th></tr>
  </thead>
  <tbody>${boqRows}</tbody>
</table>

<div class="signature-row">
  <div class="sig-box">
    <strong>ग्राहकको हस्ताक्षर</strong><br>
    ${tender.client.full_name}<br>
    ${contract.client_signed_at ? `मिति: ${contract.client_signed_at.toLocaleDateString("ne-NP")}` : "हस्ताक्षर बाँकी"}
  </div>
  <div class="sig-box">
    <strong>ठेकेदारको हस्ताक्षर</strong><br>
    ${awardedBid?.bidder.full_name ?? ""}<br>
    ${contract.contractor_signed_at ? `मिति: ${contract.contractor_signed_at.toLocaleDateString("ne-NP")}` : "हस्ताक्षर बाँकी"}
  </div>
</div>
</body>
</html>`;

    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4", margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } });
    await browser.close();

    await uploadBuffer(pdfKey, Buffer.from(pdfBuffer), "application/pdf");

    await prisma.bidContract.update({
      where: { id: contract.id },
      data: {
        pdf_url: pdfKey,
        pdf_generated_at: new Date(),
        file_size_bytes: pdfBuffer.byteLength,
      },
    });

    const url = await getDownloadUrl(pdfKey);
    return NextResponse.json({ url });
  } catch (err) {
    return handleApiError(err);
  }
}
