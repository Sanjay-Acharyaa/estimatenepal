import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generateBOQ } from "@/lib/boq";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkExportRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import { trackEvent } from "@/lib/analytics";
import { fmtNum } from "@/lib/format";
import { RATE_DEFAULTS } from "@/lib/rate-defaults";

export const maxDuration = 60;

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]+$/;

const NRS = (n: number) => fmtNum(n, 2);

interface RaLine {
  name: string; unit: string; unitRate: number;
  qtyPerUnit: number; wastagePercent: number; lineType: string;
}
interface RaItem {
  code: string; description: string; unit: string; baseRate: number; lines: RaLine[];
}

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
// Cover page → Org letterhead → Scope of Work → Full BOQ → Rate Analysis (new resource-line system) → Declaration
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkExportRateLimit(ip);
    if (limited) return limited;

    if (!PROJECT_ID_RE.test(params.id) || params.id.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid project ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        org: { select: { name: true, address: true, phone: true, logoUrl: true, panNumber: true } },
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

    // Collect rate item IDs from the BOQ (same pattern as excel export)
    const rateItemIds = boq.disciplines
      .flatMap(d => d.groups)
      .map(g => g.rateItemId)
      .filter((id): id is string => id !== null);

    // Fetch new-system analysis lines + org rate settings in parallel
    const [analysisLines, orgSettings] = await Promise.all([
      rateItemIds.length > 0
        ? prisma.rateAnalysisLine.findMany({
            where: { rateItemId: { in: rateItemIds }, orgId: project.orgId },
            include: {
              resource: { select: { name: true, unit: true, unitRate: true } },
              rateItem:  { select: { id: true, code: true, description: true, unit: true, baseRate: true } },
            },
            orderBy: [{ rateItemId: "asc" }, { sortOrder: "asc" }],
          })
        : Promise.resolve([]),
      prisma.orgRateSettings.findUnique({ where: { orgId: project.orgId } }),
    ]);

    // DUDBC percentage settings — org-specific or DUDBC standard defaults
    const s = {
      overheadPct:    Number(orgSettings?.overheadPct    ?? RATE_DEFAULTS.overheadPct),
      profitPct:      Number(orgSettings?.profitPct      ?? RATE_DEFAULTS.profitPct),
      contingencyPct: Number(orgSettings?.contingencyPct ?? RATE_DEFAULTS.contingencyPct),
      leadLiftPct:    Number(orgSettings?.leadLiftPct    ?? RATE_DEFAULTS.leadLiftPct),
    };

    // Build per-rate-item map (rate item → resource lines)
    const rateItemMap = new Map<string, RaItem>();
    for (const line of analysisLines) {
      const rid = line.rateItemId;
      if (!rateItemMap.has(rid)) {
        rateItemMap.set(rid, {
          code:        line.rateItem.code,
          description: line.rateItem.description,
          unit:        line.rateItem.unit,
          baseRate:    Number(line.rateItem.baseRate),
          lines:       [],
        });
      }
      rateItemMap.get(rid)!.lines.push({
        name:           line.resource.name,
        unit:           line.resource.unit,
        unitRate:       Number(line.resource.unitRate),
        qtyPerUnit:     Number(line.qtyPerUnit),
        wastagePercent: Number(line.wastagePercent),
        lineType:       line.lineType,
      });
    }

    // DUDBC formula (mirrors ResourceLineAnalysis.tsx and lib/export.ts):
    // lineCost = qtyPerUnit × unitRate × (1 + wastage%)
    // directCost = Σ(lineCosts)
    // overhead   = A × overheadPct
    // profit     = (A + overhead) × profitPct
    // contingency= (A + overhead + profit) × contingencyPct
    // leadLift   = A × leadLiftPct
    // preVat     = A + overhead + profit + contingency + leadLift
    const computeRateBreakdown = (item: RaItem) => {
      const directCost  = item.lines.reduce((sum, l) => sum + l.qtyPerUnit * l.unitRate * (1 + l.wastagePercent / 100), 0);
      const overhead    = directCost * (s.overheadPct / 100);
      const profit      = (directCost + overhead) * (s.profitPct / 100);
      const contingency = (directCost + overhead + profit) * (s.contingencyPct / 100);
      const leadLift    = directCost * (s.leadLiftPct / 100);
      const preVat      = directCost + overhead + profit + contingency + leadLift;
      return { directCost, overhead, profit, contingency, leadLift, preVat };
    };

    const LINE_TYPE_LABELS: Record<string, string> = {
      MATERIAL: "Materials", LABOUR: "Labour", EQUIPMENT: "Equipment", OTHER: "Other",
    };
    const LINE_TYPE_ORDER = ["MATERIAL", "LABOUR", "EQUIPMENT", "OTHER"] as const;

    // Pre-build rate analysis HTML so the main template stays readable
    const rateItemsArray = Array.from(rateItemMap.values());
    const rateAnalysisHtml = rateItemsArray.length > 0 ? `
<div class="page">
  <h2>Rate Analysis</h2>
  <div style="font-size:10px;color:#6b7280;margin-bottom:6px;">
    DUDBC Formula: Direct Cost (A) + Overhead (${s.overheadPct}% of A) + Profit (${s.profitPct}% of A+OH) + Contingency (${s.contingencyPct}% of A+OH+P) + Lead &amp; Lift (${s.leadLiftPct}% of A) = Pre-VAT Base Rate
  </div>
  <div class="divider"></div>
  <div style="margin-top:16px;">
    ${rateItemsArray.map(item => {
      const { directCost, overhead, profit, contingency, leadLift, preVat } = computeRateBreakdown(item);

      const linesByType = new Map<string, RaLine[]>();
      for (const lt of LINE_TYPE_ORDER) linesByType.set(lt, []);
      for (const ln of item.lines) {
        const key = LINE_TYPE_ORDER.includes(ln.lineType as typeof LINE_TYPE_ORDER[number])
          ? ln.lineType as typeof LINE_TYPE_ORDER[number]
          : "OTHER";
        linesByType.get(key)!.push(ln);
      }

      const activeSections = LINE_TYPE_ORDER.filter(lt => (linesByType.get(lt)?.length ?? 0) > 0);

      return `
      <div class="rate-analysis-item">
        <div class="ra-title">${escHtml(item.code)} — ${escHtml(item.description)} <span style="font-weight:normal;color:#6b7280">(per ${escHtml(item.unit)})</span></div>
        ${activeSections.map(lt => {
          const lines = linesByType.get(lt)!;
          const sectionTotal = lines.reduce((sum, ln) => sum + ln.qtyPerUnit * ln.unitRate * (1 + ln.wastagePercent / 100), 0);
          return `
          <div class="ra-section">${LINE_TYPE_LABELS[lt]}</div>
          <table style="margin-bottom:4px;">
            <thead>
              <tr>
                <th style="width:35%">Resource</th>
                <th class="text-right" style="width:12%">Qty/Unit</th>
                <th style="width:8%">Unit</th>
                <th class="text-right" style="width:15%">Rate (NRS)</th>
                <th class="text-right" style="width:10%">Wastage</th>
                <th class="text-right" style="width:20%">Line Cost (NRS)</th>
              </tr>
            </thead>
            <tbody>
              ${lines.map(ln => {
                const lnCost = ln.qtyPerUnit * ln.unitRate * (1 + ln.wastagePercent / 100);
                return `<tr>
                  <td>${escHtml(ln.name)}</td>
                  <td class="text-right">${ln.qtyPerUnit.toFixed(3)}</td>
                  <td>${escHtml(ln.unit)}</td>
                  <td class="text-right">${NRS(ln.unitRate)}</td>
                  <td class="text-right">${ln.wastagePercent > 0 ? ln.wastagePercent.toFixed(1) + "%" : "—"}</td>
                  <td class="text-right">${NRS(lnCost)}</td>
                </tr>`;
              }).join("")}
              <tr style="font-weight:600;background:#eff6ff;">
                <td colspan="5" class="text-right">${LINE_TYPE_LABELS[lt]} Sub-total</td>
                <td class="text-right">${NRS(sectionTotal)}</td>
              </tr>
            </tbody>
          </table>`;
        }).join("")}
        <div class="ra-direct-total"><span>Direct Cost (A)</span><span>NRS ${NRS(directCost)}</span></div>
        <div class="ra-formula"><span>Overhead — ${s.overheadPct}% of A</span><span>NRS ${NRS(overhead)}</span></div>
        <div class="ra-formula"><span>Profit — ${s.profitPct}% of (A + Overhead)</span><span>NRS ${NRS(profit)}</span></div>
        <div class="ra-formula"><span>Contingency — ${s.contingencyPct}% of (A + Overhead + Profit)</span><span>NRS ${NRS(contingency)}</span></div>
        ${s.leadLiftPct > 0 ? `<div class="ra-formula"><span>Lead &amp; Lift — ${s.leadLiftPct}% of A</span><span>NRS ${NRS(leadLift)}</span></div>` : ""}
        <div class="computed-rate">
          Pre-VAT Base Rate: NRS ${NRS(preVat)} / ${escHtml(item.unit)}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          Stored Base Rate: NRS ${NRS(item.baseRate)} / ${escHtml(item.unit)}
        </div>
      </div>`;
    }).join("")}
  </div>
</div>` : "";

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
  .discipline-header td { background: #1E3A5F !important; color: #fff; font-weight: bold; font-size: 11px; }
  .group-row td { background: #EFF6FF !important; font-weight: bold; }
  .total-row td { font-weight: bold; background: #DBEAFE !important; }
  .grand-total td { font-weight: bold; font-size: 12px; background: #1E3A5F !important; color: #fff; }
  .rate-analysis-item { margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 4px; padding: 10px; page-break-inside: avoid; }
  .ra-title { font-weight: bold; color: #1E3A5F; margin-bottom: 8px; font-size: 11px; }
  .ra-section { font-size: 9px; font-weight: bold; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 8px 0 2px; }
  .ra-direct-total { display: flex; justify-content: space-between; font-weight: bold; padding: 5px 0; border-top: 2px solid #1E3A5F; border-bottom: 1px dashed #1E3A5F; font-size: 11px; margin-top: 4px; }
  .ra-formula { display: flex; justify-content: space-between; font-size: 10px; padding: 3px 0; color: #374151; border-bottom: 1px dotted #e5e7eb; }
  .computed-rate { font-weight: bold; color: #059669; margin-top: 6px; font-size: 11px; border-top: 2px solid #059669; padding-top: 5px; }
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
            <td class="text-right"></td>
            <td class="text-right">${NRS(grp.rate)}</td>
            <td class="text-right">${NRS(grp.amount)}</td>
          </tr>
          ${grp.items.map(item => `
          <tr style="font-size:9px;">
            <td></td>
            <td style="padding-left:20px;">${escHtml(item.label)}</td>
            <td>${escHtml(item.unit)}</td>
            <td class="text-right">${item.quantity.toFixed(3)}</td>
            <td></td>
            <td></td>
          </tr>`).join("")}
          <tr style="font-size:9px;font-weight:600;">
            <td></td>
            <td style="text-align:right;padding-right:8px;">Total</td>
            <td>${escHtml(grp.unit)}</td>
            <td class="text-right">${grp.totalQuantity.toFixed(3)}</td>
            <td></td>
            <td></td>
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
        <td colspan="5" class="text-right">Contingency (${boq.project.contingencyPct}%)</td>
        <td class="text-right">${NRS(boq.contingencyAmount)}</td>
      </tr>` : ""}
      ${boq.provisionalSum > 0 ? `
      <tr class="total-row">
        <td colspan="5" class="text-right">Provisional Sum</td>
        <td class="text-right">${NRS(boq.provisionalSum)}</td>
      </tr>` : ""}
      ${boq.vatAmount > 0 ? `
      <tr class="total-row">
        <td colspan="5" class="text-right">VAT (${boq.project.vatRate}%)</td>
        <td class="text-right">${NRS(boq.vatAmount)}</td>
      </tr>` : ""}
      ${boq.tdsAmount > 0 ? `
      <tr class="total-row">
        <td colspan="5" class="text-right">TDS Deduction (${boq.project.tdsRate}%)</td>
        <td class="text-right">(${NRS(boq.tdsAmount)})</td>
      </tr>` : ""}
      <tr class="grand-total">
        <td colspan="5" class="text-right">TOTAL PAYABLE AMOUNT</td>
        <td class="text-right">${NRS(boq.finalPayable)}</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- RATE ANALYSIS (new resource-line system) -->
${rateAnalysisHtml}

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

    // Wrap Puppeteer in try/finally so the browser process is always closed even if pdf() throws
    const result = await withSemaphore("pdf", 3, async () => {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      try {
        const browserPage = await browser.newPage();
        await browserPage.setJavaScriptEnabled(false);
        await browserPage.setContent(html, { waitUntil: "domcontentloaded" });
        const pdfBytes = await browserPage.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm" },
        });
        const filename = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Tender.pdf`;
        return new NextResponse(new Uint8Array(pdfBytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      } finally {
        await browser.close();
      }
    });
    return result as NextResponse;
  } catch (err) {
    return handleApiError(err);
  }
}
