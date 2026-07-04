import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import { fmtNum } from "@/lib/format";
import { generateBOQ } from "@/lib/boq";

export const maxDuration = 60;

function esc(s: string | null | undefined) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const NRS = (n: number) => fmtNum(n, 2);

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { org: { select: { name: true, address: true, phone: true, logoUrl: true } } },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const quotes = await prisma.subcontractorQuote.findMany({
      where: { projectId: params.id },
      orderBy: { amount: "asc" },
    });

    if (quotes.length < 1) {
      return NextResponse.json({ error: "No quotes to compare." }, { status: 400 });
    }

    let engineerEstimate = 0;
    try {
      const boq = await generateBOQ(params.id);
      engineerEstimate = boq.finalPayable;
    } catch { /* no BOQ yet */ }

    const today = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
    const lowestAmount = quotes[0].amount;
    const STATUS_LABELS: Record<string, string> = {
      RECEIVED: "Received", UNDER_REVIEW: "Under Review", ACCEPTED: "Accepted", REJECTED: "Rejected",
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm 16mm; }
  h1 { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 13px; font-weight: bold; text-align: center; color: #6b7280; margin-bottom: 16px; }
  .header { text-align: center; border-bottom: 2px solid #1E3A5F; padding-bottom: 12px; margin-bottom: 20px; }
  .org-name { font-size: 14px; font-weight: bold; color: #1E3A5F; }
  .meta-table { width: 100%; margin-bottom: 20px; font-size: 10px; }
  .meta-table td { padding: 4px 8px; }
  .meta-table .label { font-weight: bold; color: #374151; width: 160px; }
  table.comparison { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.comparison th { background: #1E3A5F; color: #fff; padding: 8px; text-align: center; border: 1px solid #1E3A5F; }
  table.comparison th.left { text-align: left; }
  table.comparison td { padding: 7px 8px; border: 1px solid #d1d5db; vertical-align: middle; }
  table.comparison td.num { text-align: right; font-family: monospace; }
  table.comparison td.center { text-align: center; }
  table.comparison tr:nth-child(even) td { background: #f8fafc; }
  .lowest { color: #15803d; font-weight: bold; }
  .above { color: #dc2626; }
  .row-header { background: #eff6ff; font-weight: bold; }
  .recommend-row td { background: #f0fdf4; font-weight: bold; color: #15803d; border-top: 2px solid #16a34a; }
  .sn { color: #9ca3af; width: 30px; text-align: center; }
  .footer { margin-top: 40px; }
  .sig-block { display: inline-block; width: 45%; margin-top: 60px; border-top: 1px solid #374151; padding-top: 4px; font-size: 10px; }
  .sig-left { float: left; }
  .sig-right { float: right; }
  .clearfix::after { content: ""; display: table; clear: both; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="org-name">${esc(project.org.name)}</div>
    ${project.org.address ? `<div style="font-size:10px;color:#6b7280">${esc(project.org.address)}</div>` : ""}
    <br/>
    <h1>Comparative Statement of Bids</h1>
    <h2>${esc(project.name)}</h2>
  </div>

  <table class="meta-table">
    <tr>
      <td class="label">Project Name:</td>
      <td>${esc(project.name)}</td>
      <td class="label">Date:</td>
      <td>${today}</td>
    </tr>
    ${project.clientName ? `<tr><td class="label">Client:</td><td>${esc(project.clientName)}${project.clientCompany ? ` — ${esc(project.clientCompany)}` : ""}</td><td></td><td></td></tr>` : ""}
    ${project.district ? `<tr><td class="label">District:</td><td>${esc(project.district)}</td><td></td><td></td></tr>` : ""}
    <tr>
      <td class="label">No. of Bidders:</td>
      <td>${quotes.length}</td>
      ${engineerEstimate > 0 ? `<td class="label">Engineer's Estimate:</td><td style="font-weight:bold">NRS ${NRS(engineerEstimate)}</td>` : "<td></td><td></td>"}
    </tr>
  </table>

  <table class="comparison">
    <thead>
      <tr>
        <th class="left" rowspan="2" style="width:30px">S.N.</th>
        <th class="left" rowspan="2">Particulars</th>
        ${quotes.map((q, i) => `<th>${i === 0 ? "L-1<br/>" : ""}Bidder ${i + 1}<br/><span style="font-size:9px;font-weight:normal">${esc(q.vendor)}</span></th>`).join("")}
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="sn">1</td>
        <td class="row-header">Quoted Amount (NRS)</td>
        ${quotes.map(q => `<td class="num ${q.amount === lowestAmount ? "lowest" : ""}">${NRS(q.amount)}${q.amount === lowestAmount ? "<br/><span style='font-size:9px;font-weight:normal;color:#16a34a'>Lowest (L-1)</span>" : ""}</td>`).join("")}
      </tr>
      ${engineerEstimate > 0 ? `
      <tr>
        <td class="sn">2</td>
        <td>Engineer's Estimate (NRS)</td>
        ${quotes.map(() => `<td class="num">${NRS(engineerEstimate)}</td>`).join("")}
      </tr>
      <tr>
        <td class="sn">3</td>
        <td>Deviation from Estimate (%)</td>
        ${quotes.map(q => {
          const diff = ((q.amount - engineerEstimate) / engineerEstimate) * 100;
          return `<td class="center ${diff <= 0 ? "lowest" : "above"}">${diff <= 0 ? "▼" : "▲"} ${Math.abs(diff).toFixed(2)}%</td>`;
        }).join("")}
      </tr>` : ""}
      <tr>
        <td class="sn">${engineerEstimate > 0 ? 4 : 2}</td>
        <td>Discipline / Scope</td>
        ${quotes.map(q => `<td class="center">${esc(q.discipline) || "—"}</td>`).join("")}
      </tr>
      <tr>
        <td class="sn">${engineerEstimate > 0 ? 5 : 3}</td>
        <td>Quote Validity</td>
        ${quotes.map(q => `<td class="center">${q.validUntil ? new Date(q.validUntil).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>`).join("")}
      </tr>
      <tr>
        <td class="sn">${engineerEstimate > 0 ? 6 : 4}</td>
        <td>Status</td>
        ${quotes.map(q => `<td class="center">${esc(STATUS_LABELS[q.status] ?? q.status)}</td>`).join("")}
      </tr>
      ${quotes.some(q => q.notes) ? `
      <tr>
        <td class="sn">${engineerEstimate > 0 ? 7 : 5}</td>
        <td>Notes / Remarks</td>
        ${quotes.map(q => `<td class="center" style="font-size:9px">${esc(q.notes) || "—"}</td>`).join("")}
      </tr>` : ""}
      <tr class="recommend-row">
        <td class="sn"></td>
        <td>Recommendation</td>
        ${quotes.map((q, i) => `<td class="center">${i === 0 ? "✓ Recommended (L-1)<br/><span style='font-size:9px'>Lowest Bidder</span>" : "—"}</td>`).join("")}
      </tr>
    </tbody>
  </table>

  <div style="margin-top:16px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;font-size:9px;color:#92400e">
    <strong>Note:</strong> L-1 denotes the lowest bidder. Recommendation is based on quoted price only. Technical compliance, experience, and financial capacity should be verified independently before awarding the contract.
  </div>

  <div class="footer clearfix">
    <div class="sig-block sig-left">Prepared by<br/><br/>Name: _______________<br/>Designation: _______________</div>
    <div class="sig-block sig-right">Approved by<br/><br/>Name: _______________<br/>Designation: _______________</div>
  </div>

</div>
</body>
</html>`;

    const result = await withSemaphore("pdf", 3, async () => {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const pdfBytes = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm" } });
      await browser.close();

      const filename = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Comparative_Statement.pdf`;
      return new NextResponse(new Uint8Array(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    });
    return result as NextResponse;
  } catch (err) {
    return handleApiError(err);
  }
}
