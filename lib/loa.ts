export type LoaData = {
  tenderTitle: string
  referenceNumber: string
  bidderName: string
  awardedAmount: string
  awardedAt: string
  clientOrgName: string
}

export function buildLoaHtml(data: LoaData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; color: #111; line-height: 1.6; }
  h1 { font-size: 18pt; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 11pt; color: #555; margin-bottom: 32px; }
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
</html>`
}

export async function generateLoaPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer")
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "load" })
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
      printBackground: true,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
