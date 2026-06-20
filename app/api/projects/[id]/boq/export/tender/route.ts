import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generateBOQ } from "@/lib/boq";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import { trackEvent } from "@/lib/analytics";

const NRS = (n: number) => n.toLocaleString("en-NP", { minimumFractionDigits: 2 });

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// GET /api/projects/[id]/boq/export/tender
// Generates a comprehensive tender bundle PDF:
// Cover page → Org letterhead → Scope of Work → Full BOQ → Rate Analysis summary
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        org: { select: { name: true, address: true, phone: true, logoUrl: true, panNumber: true } },
        rateAnalyses: {
          include: { rateItem: { select: { code: true, description: true, unit: true, baseRate: true } } },
        },
      },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);
    trackEvent("tender_export", { orgId: project.orgId, userId: token.id as string, meta: { projectId: params.id } });

    const boq = await generateBOQ(params.id);
    const org = project.org;
    const today = new Date().toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" });
    // Only allow HTTPS URLs to prevent SSRF against internal metadata services
    const safeLogoUrl = (org.logoUrl ?? "").startsWith("https://") ? org.logoUrl : null;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .page { width: 210mm; min-height: 297mm; padding: 20mm 18mm; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 22px; font-weight: bold; }
  h2 { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
  h3 { font-size: 13px; font-weight: bold; margin-bottom: 6px; color: #1E3A5F; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
  th { background: #1E3A5F; color: #fff; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8fafc; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .divider { border-top: 2px solid #1E3A5F; margin: 12px 0; }
  .cover { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250mm; text-align: center; }
  .cover-logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 24px; }
  .cover-org { font-size: 18px; font-weight: bold; color: #1E3A5F; margin-bottom: 4px; }
  .cover-project { font-size: 26px; font-weight: bold; margin: 20px 0 8px; }
  .cover-subtitle { font-size: 14px; color: #6b7280; }
  .cover-meta { margin-top: 32px; font-size: 11px; color: #374151; line-height: 2; }
  .section-label { font-size: 9px; font-weight: bold; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .discipline-header td { background: #1E3A5F !important; color: #fff; font-weight: bold; font-size: 11px; }
  .group-row td { background: #EFF6FF !important; font-weight: bold; }
  .total-row td { font-weight: bold; background: #DBEAFE !important; }
  .grand-total td { font-weight: bold; font-size: 12px; background: #1E3A5F !important; color: #fff; }
  .summary-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
  .summary-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e5e7eb; }
  .summary-row:last-child { border-bottom: none; font-weight: bold; font-size: 13px; }
  .rate-analysis-item { margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 4px; padding: 10px; }
  .ra-title { font-weight: bold; color: #1E3A5F; margin-bottom: 6px; }
  .ra-row { display: flex; justify-content: space-between; font-size: 10px; padding: 2px 0; }
  .computed-rate { font-weight: bold; color: #059669; margin-top: 4px; font-size: 11px; }
  @media print { .page { padding: 15mm; } }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="page">
  <div class="cover">
    ${safeLogoUrl ? `<img class="cover-logo" src="${safeLogoUrl}" alt="Logo"/>` : ""}
    <div class="cover-org">${escHtml(org.name)}</div>
    ${org.address ? `<div style="font-size:11px;color:#6b7280">${escHtml(org.address)}</div>` : ""}
    ${org.phone ? `<div style="font-size:11px;color:#6b7280">Tel: ${escHtml(org.phone)}</div>` : ""}
    <div class="divider" style="width:100%;margin:28px 0;"></div>
    <div class="cover-subtitle">TENDER DOCUMENT</div>
    <div class="cover-project">${escHtml(project.name)}</div>
    ${project.district ? `<div class="cover-subtitle">${escHtml(project.district)}</div>` : ""}
    <div class="cover-meta">
      ${project.clientCompany ? `<div><strong>Client:</strong> ${escHtml(project.clientCompany)}</div>` : ""}
      ${project.projectNumber ? `<div><strong>Project No:</strong> ${escHtml(project.projectNumber)}</div>` : ""}
      <div><strong>Prepared by:</strong> ${escHtml(org.name)}</div>
      ${org.panNumber ? `<div><strong>PAN:</strong> ${escHtml(org.panNumber)}</div>` : ""}
      <div><strong>Date:</strong> ${today}</div>
    </div>
  </div>
</div>

<!-- SCOPE OF WORK -->
${project.scopeOfWork ? `
<div class="page">
  <h2>Scope of Work</h2>
  <div class="divider"></div>
  <div style="margin-top:16px;line-height:1.8;white-space:pre-wrap;">${escHtml(project.scopeOfWork)}</div>
</div>
` : ""}

<!-- BILL OF QUANTITIES -->
<div class="page">
  <h2>Bill of Quantities</h2>
  <div style="font-size:10px;color:#6b7280;margin-bottom:12px;">Project: ${escHtml(project.name)} | Generated: ${today}</div>
  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th style="width:5%">SN</th>
        <th style="width:35%">Description</th>
        <th style="width:8%">Unit</th>
        <th style="width:10%" class="text-right">Quantity</th>
        <th style="width:12%" class="text-right">Rate (NRS)</th>
        <th style="width:14%" class="text-right">Amount (NRS)</th>
      </tr>
    </thead>
    <tbody>
      ${boq.disciplines.map((disc, di) => `
        <tr class="discipline-header">
          <td colspan="6">${String.fromCharCode(65 + di)}. ${escHtml(disc.name).toUpperCase()}</td>
        </tr>
        ${disc.groups.map((grp, gi) => `
          <tr class="group-row">
            <td>${String.fromCharCode(65 + di)}.${gi + 1}</td>
            <td>${escHtml(grp.name)}${grp.preamble ? `<br/><span style="font-weight:normal;font-size:9px;color:#6b7280">${escHtml(grp.preamble)}</span>` : ""}</td>
            <td>${escHtml(grp.unit)}</td>
            <td class="text-right">${grp.totalQuantity.toFixed(3)}</td>
            <td class="text-right">${NRS(grp.rate)}</td>
            <td class="text-right">${NRS(grp.amount)}</td>
          </tr>
        `).join("")}
        <tr class="total-row">
          <td colspan="5" class="text-right">Sub-total — ${escHtml(disc.name)}</td>
          <td class="text-right">${NRS(disc.subtotal)}</td>
        </tr>
      `).join("")}
      <tr class="grand-total">
        <td colspan="5" class="text-right">GRAND TOTAL</td>
        <td class="text-right">${NRS(boq.grandTotal)}</td>
      </tr>
      ${boq.contingencyAmount > 0 ? `
      <tr class="total-row">
        <td colspan="5" class="text-right">Contingency (${project.contingencyPct ?? 0}%)</td>
        <td class="text-right">${NRS(boq.contingencyAmount)}</td>
      </tr>` : ""}
      ${boq.provisionalSum > 0 ? `
      <tr class="total-row">
        <td colspan="5" class="text-right">Provisional Sum</td>
        <td class="text-right">${NRS(boq.provisionalSum)}</td>
      </tr>` : ""}
      ${boq.vatAmount > 0 ? `
      <tr class="total-row">
        <td colspan="5" class="text-right">VAT (${project.vatRate}%)</td>
        <td class="text-right">${NRS(boq.vatAmount)}</td>
      </tr>` : ""}
      ${boq.tdsAmount > 0 ? `
      <tr class="total-row">
        <td colspan="5" class="text-right">TDS Deduction (${project.tdsRate}%)</td>
        <td class="text-right">(${NRS(boq.tdsAmount)})</td>
      </tr>` : ""}
      <tr class="grand-total">
        <td colspan="5" class="text-right">TOTAL PAYABLE AMOUNT</td>
        <td class="text-right">${NRS(boq.finalPayable)}</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- RATE ANALYSIS -->
${project.rateAnalyses.length > 0 ? `
<div class="page">
  <h2>Rate Analysis</h2>
  <div class="divider"></div>
  <div style="margin-top:16px;">
    ${project.rateAnalyses.map(ra => `
      <div class="rate-analysis-item">
        <div class="ra-title">${escHtml(ra.rateItem.code)} — ${escHtml(ra.rateItem.description)} (per ${escHtml(ra.rateItem.unit)})</div>
        <div class="ra-row"><span>Material Cost</span><span>NRS ${NRS(ra.materialCost)}</span></div>
        <div class="ra-row"><span>Skilled Labour</span><span>NRS ${NRS(ra.skilledLabour)}</span></div>
        <div class="ra-row"><span>Semi-skilled Labour</span><span>NRS ${NRS(ra.semiSkilledLabour)}</span></div>
        <div class="ra-row"><span>Unskilled Labour</span><span>NRS ${NRS(ra.unskilledLabour)}</span></div>
        <div class="ra-row"><span>Equipment Cost</span><span>NRS ${NRS(ra.equipmentCost)}</span></div>
        <div class="ra-row"><span>Overhead (${ra.overheadPct}%)</span><span>NRS ${NRS((ra.materialCost + ra.skilledLabour + ra.semiSkilledLabour + ra.unskilledLabour + ra.equipmentCost) * ra.overheadPct / 100)}</span></div>
        <div class="ra-row"><span>Profit (${ra.profitPct}%)</span><span>NRS ${NRS((ra.materialCost + ra.skilledLabour + ra.semiSkilledLabour + ra.unskilledLabour + ra.equipmentCost) * ra.profitPct / 100)}</span></div>
        <div class="computed-rate">Composite Rate: NRS ${NRS(ra.computedRate)} / ${escHtml(ra.rateItem.unit)} ${ra.useComputedRate ? "(ACTIVE)" : "(not applied)"}</div>
      </div>
    `).join("")}
  </div>
</div>
` : ""}

<!-- DECLARATION -->
<div class="page">
  <h2>Declaration</h2>
  <div class="divider"></div>
  <div style="margin-top:24px;line-height:2.2;">
    <p>We, the undersigned, hereby declare that the rates quoted in this Bill of Quantities are inclusive of all taxes, duties, levies, and other charges as applicable under the laws of Nepal, except VAT which is shown separately.</p>
    <br/>
    <p>The quantities given in the BOQ are estimated quantities and may vary during execution. The contractor shall be paid based on actual measured quantities at the agreed unit rates.</p>
    <br/>
    <p>This tender document has been prepared in accordance with DUDBC standard specifications.</p>
  </div>
  <div style="margin-top:60px;display:flex;justify-content:space-between;">
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #374151;padding-top:6px;margin-top:40px;">Signature of Estimator</div>
      <div style="font-size:10px;color:#6b7280;">${escHtml(org.name)}</div>
    </div>
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #374151;padding-top:6px;margin-top:40px;">Signature of Client</div>
      <div style="font-size:10px;color:#6b7280;">${escHtml(project.clientCompany ?? "___________________")}</div>
    </div>
  </div>
</div>

</body>
</html>`;

    const result = await withSemaphore("pdf", 3, async () => {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
      const browserPage = await browser.newPage();
      await browserPage.setJavaScriptEnabled(false);
      await browserPage.setContent(html, { waitUntil: "domcontentloaded" });
      const pdfBytes = await browserPage.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm" } });
      await browser.close();

      const filename = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Tender.pdf`;
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
