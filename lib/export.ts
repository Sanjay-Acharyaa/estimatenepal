import ExcelJS from "exceljs";
import type { BOQDocument, BOQGroup } from "./boq";
import { fmtNum } from "./format";

export type ExportColConfig = {
  showSno: boolean;
  showUnit: boolean;
  showQty: boolean;
  showRate: boolean;
  showAmount: boolean;
  customCols?: string[];
};

const NRS = (n: number) => fmtNum(n, 2);

const qty = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sanitizeCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? " " + s : s;
}

// ─── Excel helpers ───────────────────────────────────────────────────────────

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function applyDisciplineStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  cell.alignment = { horizontal: "left", vertical: "middle" };
}

function applyGroupStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
  cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
}

function applyTotalStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  cell.alignment = { horizontal: "right", vertical: "middle" };
  cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
}

function applyOverrideStyle(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
}

function borderAll(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "hair" },
    left: { style: "hair" },
    bottom: { style: "hair" },
    right: { style: "hair" },
  };
}

// ─── BOQ Excel Export ─────────────────────────────────────────────────────────

const DEFAULT_COL_CONFIG: ExportColConfig = {
  showSno: true, showUnit: true, showQty: true, showRate: true, showAmount: true,
};

export async function buildBOQExcel(boq: BOQDocument, cols: ExportColConfig = DEFAULT_COL_CONFIG): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estimate Nepal";
  wb.created = new Date();

  const customCols = cols.customCols ?? [];
  const totalCols = 6 + customCols.length;
  const lastColLetter = String.fromCharCode(64 + totalCols);

  // ── Summary Sheet ──────────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary BOQ");
  summary.columns = [
    { key: "sno",    width: 8,  hidden: !cols.showSno },
    { key: "desc",   width: 42 },
    { key: "unit",   width: 10, hidden: !cols.showUnit },
    { key: "qty",    width: 14, hidden: !cols.showQty },
    { key: "rate",   width: 14, hidden: !cols.showRate },
    { key: "amount", width: 16, hidden: !cols.showAmount },
    ...customCols.map(label => ({ key: `custom_${label}`, width: 18 })),
  ];

  // Project header
  const titleRow = summary.addRow([`BILL OF QUANTITIES — ${boq.project.name.toUpperCase()}`]);
  summary.mergeCells(`A${titleRow.number}:${lastColLetter}${titleRow.number}`);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 24;

  if (boq.project.clientCompany || boq.project.clientName) {
    const clientRow = summary.addRow([
      `Client: ${[boq.project.clientCompany, boq.project.clientName].filter(Boolean).join(" — ")}`,
    ]);
    summary.mergeCells(`A${clientRow.number}:${lastColLetter}${clientRow.number}`);
    clientRow.getCell(1).font = { size: 10, italic: true };
    clientRow.getCell(1).alignment = { horizontal: "center" };
  }

  const metaRow = summary.addRow([
    `District: ${boq.project.district ?? "—"}  |  Date: ${new Date(boq.generatedAt).toLocaleDateString("en-NP")}`,
  ]);
  summary.mergeCells(`A${metaRow.number}:${lastColLetter}${metaRow.number}`);
  metaRow.getCell(1).font = { size: 9, color: { argb: "FF6B7280" } };
  metaRow.getCell(1).alignment = { horizontal: "center" };

  summary.addRow([]);

  // Column headers (standard + custom)
  const hdr = summary.addRow([
    "S.No.", "Description of Work", "Unit", "Quantity", "Rate (NRS)", "Amount (NRS)",
    ...customCols,
  ]);
  hdr.eachCell((c) => applyHeaderStyle(c));
  hdr.height = 20;

  let sno = 1;

  for (const disc of boq.disciplines) {
    // Discipline row
    const dRow = summary.addRow([sanitizeCell(disc.name.toUpperCase())]);
    summary.mergeCells(`A${dRow.number}:F${dRow.number}`);
    dRow.eachCell((c) => applyDisciplineStyle(c));
    dRow.height = 18;

    let dSno = 1;
    for (const grp of disc.groups) {
      const grpLabel = `${sno}.${dSno}  ${grp.name}`;
      const gRow = summary.addRow([`${sno}.${dSno}`, sanitizeCell(grp.name), grp.unit, grp.totalQuantity, grp.rate, grp.amount]);
      gRow.eachCell((c) => { applyGroupStyle(c); borderAll(c); });

      // Yellow for overridden rate
      if (grp.isOverridden) {
        applyOverrideStyle(gRow.getCell(5));
      }

      gRow.getCell(4).alignment = { horizontal: "right" };
      gRow.getCell(5).alignment = { horizontal: "right" };
      gRow.getCell(6).alignment = { horizontal: "right" };
      gRow.getCell(6).numFmt = '#,##0.00';
      gRow.getCell(5).numFmt = '#,##0.00';
      gRow.getCell(4).numFmt = '#,##0.000';

      dSno++;
      void grpLabel;
    }

    // Discipline subtotal
    const stRow = summary.addRow(["", `${disc.name} Sub-Total`, "", "", "", disc.subtotal]);
    summary.mergeCells(`A${stRow.number}:E${stRow.number}`);
    stRow.eachCell((c) => applyTotalStyle(c));
    stRow.getCell(6).numFmt = '#,##0.00';
    stRow.getCell(6).alignment = { horizontal: "right" };

    summary.addRow([]);
    sno++;
  }

  // Financial summary
  summary.addRow([]);
  const addFinRow = (label: string, value: number, bold = false) => {
    const r = summary.addRow(["", label, "", "", "", value]);
    summary.mergeCells(`A${r.number}:E${r.number}`);
    r.getCell(2).font = { bold, size: 10 };
    r.getCell(2).alignment = { horizontal: "right" };
    r.getCell(6).numFmt = '#,##0.00';
    r.getCell(6).alignment = { horizontal: "right" };
    r.getCell(6).font = { bold };
    return r;
  };

  addFinRow("Grand Total", boq.grandTotal, true);
  if (boq.project.contingencyPct > 0) {
    addFinRow(`Contingency (${boq.project.contingencyPct}%)`, boq.contingencyAmount);
  }
  if (boq.provisionalSum > 0) {
    addFinRow("Provisional Sum", boq.provisionalSum);
  }
  if (boq.project.vatEnabled) {
    addFinRow(`VAT (${boq.project.vatRate}%)`, boq.vatAmount);
  }
  if (boq.project.tdsEnabled) {
    addFinRow(`TDS (${boq.project.tdsRate}%)`, -boq.tdsAmount);
  }
  addFinRow("FINAL PAYABLE (NRS)", boq.finalPayable, true);

  // ── Detail Sheets (one per discipline) ────────────────────────────────────
  for (const disc of boq.disciplines) {
    const ws = wb.addWorksheet(disc.name.substring(0, 31));
    ws.columns = [
      { key: "sno", width: 8 },
      { key: "desc", width: 38 },
      { key: "mult", width: 8 },
      { key: "len", width: 10 },
      { key: "brd", width: 10 },
      { key: "hgt", width: 10 },
      { key: "qty", width: 12 },
      { key: "unit", width: 10 },
      { key: "rate", width: 14 },
      { key: "amount", width: 16 },
    ];

    const dHdr = ws.addRow(["S.No.", "Description", "No.", "Length", "Breadth", "Height", "Quantity", "Unit", "Rate (NRS)", "Amount (NRS)"]);
    dHdr.eachCell((c) => applyHeaderStyle(c));
    dHdr.height = 20;

    let lineNo = 1;
    for (const grp of disc.groups) {
      // Group header
      const ghRow = ws.addRow([`${lineNo}`, sanitizeCell(grp.name)]);
      ws.mergeCells(`B${ghRow.number}:J${ghRow.number}`);
      ghRow.eachCell((c) => applyGroupStyle(c));
      if (grp.preamble) {
        const pRow = ws.addRow(["", sanitizeCell(grp.preamble)]);
        ws.mergeCells(`B${pRow.number}:J${pRow.number}`);
        pRow.getCell(2).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
      }

      // Item sub-rows
      for (const item of grp.items) {
        const iRow = ws.addRow([
          "",
          `  ${item.label}`,
          item.multiplier !== 1 ? item.multiplier : null,
          item.length ?? null,
          item.breadth ?? null,
          item.height ?? null,
          item.quantity,
          grp.unit,
          null,
          null,
        ]);
        // Use explicit range so empty (null) cells also get borders
        for (let col = 1; col <= 10; col++) {
          const c = iRow.getCell(col);
          c.alignment = { horizontal: "right", vertical: "middle" };
          borderAll(c);
        }
        iRow.getCell(2).alignment = { horizontal: "left" };
        iRow.getCell(7).numFmt = '#,##0.000';
      }

      // Group total row
      const safeTotal = Number.isFinite(grp.totalQuantity) ? grp.totalQuantity : 0;
      const tRow = ws.addRow([
        "", `Total — ${sanitizeCell(grp.name)}`, "", "", "", "",
        safeTotal, grp.unit, grp.rate, grp.amount,
      ]);
      tRow.eachCell((c) => applyTotalStyle(c));
      tRow.getCell(7).numFmt = '#,##0.000';
      tRow.getCell(9).numFmt = '#,##0.00';
      tRow.getCell(10).numFmt = '#,##0.00';
      if (grp.isOverridden) applyOverrideStyle(tRow.getCell(9));

      ws.addRow([]);
      lineNo++;
    }

    // Discipline subtotal
    const stRow = ws.addRow(["", `${sanitizeCell(disc.name)} — Sub-Total`, "", "", "", "", "", "", "", disc.subtotal]);
    ws.mergeCells(`A${stRow.number}:I${stRow.number}`);
    stRow.eachCell((c) => applyTotalStyle(c));
    stRow.getCell(10).numFmt = '#,##0.00';
    stRow.getCell(10).alignment = { horizontal: "right" };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ─── MB (Measurement Book) Excel Export ───────────────────────────────────────

export async function buildMBExcel(boq: BOQDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estimate Nepal";
  wb.created = new Date();

  const ws = wb.addWorksheet("Measurement Book");
  ws.columns = [
    { key: "sno", width: 8 },
    { key: "desc", width: 36 },
    { key: "mult", width: 8 },
    { key: "len", width: 10 },
    { key: "brd", width: 10 },
    { key: "hgt", width: 10 },
    { key: "qty", width: 12 },
    { key: "unit", width: 10 },
    { key: "site", width: 20 },
    { key: "date", width: 14 },
    { key: "remarks", width: 28 },
  ];

  // Title
  const titleRow = ws.addRow([`MEASUREMENT BOOK — ${boq.project.name.toUpperCase()}`]);
  ws.mergeCells(`A${titleRow.number}:K${titleRow.number}`);
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 22;
  ws.addRow([]);

  const hdr = ws.addRow(["S.No.", "Description", "No.", "Length", "Breadth", "Height", "Quantity", "Unit", "Site Location", "Measured Date", "Remarks"]);
  hdr.eachCell((c) => applyHeaderStyle(c));
  hdr.height = 20;

  let lineNo = 1;
  for (const disc of boq.disciplines) {
    const dRow = ws.addRow([sanitizeCell(disc.name.toUpperCase())]);
    ws.mergeCells(`A${dRow.number}:K${dRow.number}`);
    dRow.eachCell((c) => applyDisciplineStyle(c));

    for (const grp of disc.groups) {
      const ghRow = ws.addRow([`${lineNo}`, sanitizeCell(grp.name)]);
      ws.mergeCells(`B${ghRow.number}:K${ghRow.number}`);
      ghRow.eachCell((c) => applyGroupStyle(c));

      for (const item of grp.items) {
        const iRow = ws.addRow([
          "",
          `  ${item.label}`,
          item.multiplier !== 1 ? item.multiplier : null,
          item.length ?? null,
          item.breadth ?? null,
          item.height ?? null,
          item.quantity,
          grp.unit,
          item.siteLocation ?? "",
          item.measuredDate ? new Date(item.measuredDate).toLocaleDateString("en-NP") : "",
          item.notes ?? "",
        ]);
        // Use explicit range so empty (null) cells also get borders
        for (let col = 1; col <= 11; col++) {
          const c = iRow.getCell(col);
          c.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
          borderAll(c);
        }
        iRow.getCell(2).alignment = { horizontal: "left", wrapText: true };
        iRow.getCell(9).alignment = { horizontal: "left" };
        iRow.getCell(11).alignment = { horizontal: "left", wrapText: true };
        iRow.getCell(7).numFmt = '#,##0.000';
      }

      const safeTotalMB = Number.isFinite(grp.totalQuantity) ? grp.totalQuantity : 0;
      const tRow = ws.addRow([
        "", `Total — ${grp.name}`, "", "", "", "", safeTotalMB, grp.unit,
      ]);
      tRow.eachCell((c) => applyTotalStyle(c));
      tRow.getCell(7).numFmt = '#,##0.000';
      ws.addRow([]);
      lineNo++;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ─── BOQ HTML for PDF ─────────────────────────────────────────────────────────

export function buildBOQHtml(boq: BOQDocument): string {
  const date = new Date(boq.generatedAt).toLocaleDateString("en-NP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const groupRows = (grp: BOQGroup, sno: string) => {
    const overrideTip = grp.isOverridden
      ? `title="Original rate: NRS ${NRS(grp.originalRate ?? 0)}"`
      : "";
    const rateCell = grp.isOverridden
      ? `<td class="num override" ${overrideTip}>${NRS(grp.rate)}</td>`
      : `<td class="num">${NRS(grp.rate)}</td>`;

    const itemRows = grp.items
      .map(
        (item) => `
      <tr class="item-row">
        <td></td>
        <td class="desc indent">${esc(item.label)}</td>
        <td class="num">${item.multiplier !== 1 ? item.multiplier : ""}</td>
        <td class="num">${item.length != null ? qty(item.length) : ""}</td>
        <td class="num">${item.breadth != null ? qty(item.breadth) : ""}</td>
        <td class="num">${item.height != null ? qty(item.height) : ""}</td>
        <td class="num">${qty(item.quantity)}</td>
        <td>${grp.unit}</td>
        <td></td>
        <td></td>
      </tr>`
      )
      .join("");

    return `
    <tr class="group-row">
      <td>${sno}</td>
      <td class="desc"><strong>${esc(grp.name)}</strong>${grp.preamble ? `<div class="preamble">${esc(grp.preamble)}</div>` : ""}</td>
      <td colspan="5"></td>
      <td>${grp.unit}</td>
      ${rateCell}
      <td class="num">${NRS(grp.amount)}</td>
    </tr>
    ${itemRows}`;
  };

  const disciplineSections = boq.disciplines
    .map((disc, di) => {
      const groups = disc.groups
        .map((grp, gi) => groupRows(grp, `${di + 1}.${gi + 1}`))
        .join("");
      return `
    <tr class="discipline-row">
      <td colspan="10">${esc(disc.name).toUpperCase()}</td>
    </tr>
    ${groups}
    <tr class="subtotal-row">
      <td colspan="9" class="right"><strong>${esc(disc.name)} Sub-Total</strong></td>
      <td class="num"><strong>NRS ${NRS(disc.subtotal)}</strong></td>
    </tr>
    <tr><td colspan="10" style="height:8px"></td></tr>`;
    })
    .join("");

  const finRows = [
    ["Grand Total", boq.grandTotal, true],
    ...(boq.project.contingencyPct > 0
      ? [[`Contingency (${boq.project.contingencyPct}%)`, boq.contingencyAmount, false]]
      : []),
    ...(boq.provisionalSum > 0
      ? [["Provisional Sum", boq.provisionalSum, false]]
      : []),
    ...(boq.project.vatEnabled
      ? [[`VAT (${boq.project.vatRate}%)`, boq.vatAmount, false]]
      : []),
    ...(boq.project.tdsEnabled
      ? [[`TDS (${boq.project.tdsRate}%)`, -boq.tdsAmount, false]]
      : []),
    ["FINAL PAYABLE (NRS)", boq.finalPayable, true],
  ]
    .map(
      ([label, val, bold]) =>
        `<tr class="fin-row${bold ? " fin-total" : ""}">
          <td colspan="9" class="right">${label}</td>
          <td class="num">NRS ${NRS(val as number)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: #fff; }
  .page { padding: 20mm 15mm; }
  h1 { text-align: center; font-size: 14pt; color: #1e3a5f; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 9pt; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 6px; font-size: 9pt; }
  th { background: #1e3a5f; color: #fff; text-align: center; border: 1px solid #1e3a5f; }
  td { border: 1px solid #d1d5db; vertical-align: middle; }
  .discipline-row td { background: #2563eb; color: #fff; font-weight: bold; padding: 5px 8px; border-color: #2563eb; }
  .group-row td { background: #eff6ff; font-weight: 600; }
  .item-row td { background: #fff; }
  .subtotal-row td { background: #dbeafe; font-weight: bold; }
  .fin-row td { background: #f9fafb; }
  .fin-total td { background: #1e3a5f; color: #fff; font-weight: bold; }
  .num { text-align: right; }
  .right { text-align: right; }
  .desc { text-align: left; }
  .indent { padding-left: 20px; }
  .preamble { font-size: 8pt; font-style: italic; color: #6b7280; font-weight: normal; margin-top: 2px; }
  .override { background: #fef9c3 !important; }
  @media print {
    body { font-size: 9pt; }
    .page { padding: 10mm; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>BILL OF QUANTITIES</h1>
  <div class="subtitle">
    ${esc(boq.project.name)}
    ${boq.project.clientCompany ? ` — ${esc(boq.project.clientCompany)}` : ""}
    ${boq.project.district ? ` | ${esc(boq.project.district)}` : ""}
    | Date: ${date}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:6%">S.No.</th>
        <th style="width:30%">Description of Work</th>
        <th style="width:5%">No.</th>
        <th style="width:8%">Length</th>
        <th style="width:8%">Breadth</th>
        <th style="width:8%">Height</th>
        <th style="width:9%">Quantity</th>
        <th style="width:6%">Unit</th>
        <th style="width:10%">Rate (NRS)</th>
        <th style="width:10%">Amount (NRS)</th>
      </tr>
    </thead>
    <tbody>
      ${disciplineSections}
      ${finRows}
    </tbody>
  </table>
</div>
</body>
</html>`;
}

// ─── PDF via Puppeteer ────────────────────────────────────────────────────────

export async function buildBOQPdf(boq: BOQDocument): Promise<Buffer> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(buildBOQHtml(boq), { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", right: "10mm", bottom: "15mm", left: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ─── Nepal Government BOQ Export (DUDBC Standard) ────────────────────────────

export type GovtBOQMeta = {
  ministry?: string;
  department?: string;
  office?: string;
  projectName: string;
  schemeNo?: string;
  district?: string;
  ward?: string;
  fiscalYear?: string;
  contractorName?: string;
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
};

function applyGovtHeaderStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function applyGovtColHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
}

function applyGovtGroupRow(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1D5DB" } };
  cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
}

function applyGovtItemRow(cell: ExcelJS.Cell) {
  cell.font = { size: 10 };
  cell.border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
}

function applyGovtTotalRow(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
}

function applyGovtGrandTotal(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

export async function buildGovtBOQExcel(boq: BOQDocument, meta: GovtBOQMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estimate Nepal";
  wb.created = new Date();

  const ws = wb.addWorksheet("Government BOQ", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true },
  });

  // Column widths: SN | Description | Unit | Qty | Rate | Amount
  ws.columns = [
    { key: "sn",     width: 7 },
    { key: "desc",   width: 44 },
    { key: "unit",   width: 9 },
    { key: "qty",    width: 12 },
    { key: "rate",   width: 14 },
    { key: "amount", width: 16 },
  ];

  const COLS = 6;
  const mergeRow = (row: ExcelJS.Row, style?: (c: ExcelJS.Cell) => void) => {
    ws.mergeCells(`A${row.number}:F${row.number}`);
    if (style) style(row.getCell(1));
  };

  // ── Government Header ────────────────────────────────────────────────────
  const r1 = ws.addRow(["नेपाल सरकार / Government of Nepal"]);
  mergeRow(r1);
  applyGovtHeaderStyle(r1.getCell(1));
  r1.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1E3A5F" } };
  r1.height = 22;

  const ministry = meta.ministry ?? "शहरी विकास मन्त्रालय / Ministry of Urban Development";
  const r2 = ws.addRow([ministry]);
  mergeRow(r2);
  applyGovtHeaderStyle(r2.getCell(1));
  r2.height = 18;

  const department = meta.department ?? "शहरी विकास तथा भवन निर्माण विभाग / DUDBC";
  const r3 = ws.addRow([department]);
  mergeRow(r3);
  applyGovtHeaderStyle(r3.getCell(1));
  r3.height = 18;

  if (meta.office) {
    const rOff = ws.addRow([meta.office]);
    mergeRow(rOff);
    applyGovtHeaderStyle(rOff.getCell(1));
    rOff.height = 16;
  }

  ws.addRow([]);

  // ── Project Details ──────────────────────────────────────────────────────
  const titleRow = ws.addRow([`आयोजना / Project: ${meta.projectName}`]);
  mergeRow(titleRow);
  titleRow.getCell(1).font = { bold: true, size: 11 };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 18;

  if (meta.schemeNo) {
    const rScheme = ws.addRow([`योजना नं. / Scheme No.: ${meta.schemeNo}`]);
    mergeRow(rScheme);
    rScheme.getCell(1).font = { size: 10 };
    rScheme.getCell(1).alignment = { horizontal: "center" };
  }

  const metaStr = [
    meta.district ? `जिल्ला / District: ${meta.district}` : null,
    meta.ward     ? `वडा नं. / Ward No.: ${meta.ward}` : null,
    meta.fiscalYear ? `आ.व. / FY: ${meta.fiscalYear}` : null,
  ].filter(Boolean).join("   |   ");
  if (metaStr) {
    const rMeta = ws.addRow([metaStr]);
    mergeRow(rMeta);
    rMeta.getCell(1).font = { size: 10, italic: true };
    rMeta.getCell(1).alignment = { horizontal: "center" };
  }

  if (meta.contractorName) {
    const rCont = ws.addRow([`ठेकेदार / Contractor: ${meta.contractorName}`]);
    mergeRow(rCont);
    rCont.getCell(1).font = { size: 10 };
    rCont.getCell(1).alignment = { horizontal: "center" };
  }

  ws.addRow([]);

  // ── BOQ Title ────────────────────────────────────────────────────────────
  const boqTitle = ws.addRow(["लागत अनुमान (Bill of Quantities)"]);
  mergeRow(boqTitle);
  boqTitle.getCell(1).font = { bold: true, size: 12, underline: true };
  boqTitle.getCell(1).alignment = { horizontal: "center" };
  boqTitle.height = 20;

  ws.addRow([]);

  // ── Column Headers (bilingual) ───────────────────────────────────────────
  const hdr1 = ws.addRow(["क्र.सं.", "काम/सामग्रीको विवरण", "एकाई", "परिमाण", "दर (रू.)", "जम्मा रकम (रू.)"]);
  hdr1.eachCell((c) => applyGovtColHeader(c));
  hdr1.height = 18;

  const hdr2 = ws.addRow(["S.N.", "Description of Work", "Unit", "Quantity", "Rate (NRS)", "Amount (NRS)"]);
  hdr2.eachCell((c) => applyGovtColHeader(c));
  hdr2.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  hdr2.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  hdr2.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  hdr2.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  hdr2.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  hdr2.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  hdr2.height = 16;

  // ── BOQ Items ────────────────────────────────────────────────────────────
  let sno = 1;
  let grandTotal = 0;

  for (const disc of boq.disciplines) {
    // Discipline row
    const dRow = ws.addRow([``, sanitizeCell(disc.name.toUpperCase()), "", "", "", ""]);
    ws.mergeCells(`A${dRow.number}:F${dRow.number}`);
    dRow.eachCell((c) => applyGovtGroupRow(c));
    dRow.height = 16;

    for (const grp of disc.groups) {
      // Group row
      const gRow = ws.addRow([`${sno}.`, sanitizeCell(grp.name), sanitizeCell(grp.unit), "", NRS(grp.rate), NRS(grp.amount)]);
      gRow.eachCell((c) => applyGovtGroupRow(c));
      gRow.getCell(1).alignment = { horizontal: "center" };
      gRow.getCell(4).alignment = { horizontal: "right" };
      gRow.getCell(5).alignment = { horizontal: "right" };
      gRow.getCell(6).alignment = { horizontal: "right" };
      gRow.height = 16;

      // Sub-items (measurement lines)
      for (const item of grp.items) {
        const iRow = ws.addRow(["", sanitizeCell(`  ${item.label}`), sanitizeCell(grp.unit), item.quantity.toFixed(3), "", ""]);
        iRow.eachCell((c) => applyGovtItemRow(c));
        iRow.getCell(4).alignment = { horizontal: "right" };
      }

      // Group total
      const tRow = ws.addRow(["", "जम्मा / Total", sanitizeCell(grp.unit), grp.totalQuantity.toFixed(3), NRS(grp.rate), NRS(grp.amount)]);
      tRow.eachCell((c) => applyGovtTotalRow(c));
      tRow.getCell(2).alignment = { horizontal: "right" };
      tRow.getCell(4).alignment = { horizontal: "right" };
      tRow.getCell(5).alignment = { horizontal: "right" };
      tRow.getCell(6).alignment = { horizontal: "right" };

      grandTotal += grp.amount;
      sno++;
    }

    // Discipline subtotal
    const stRow = ws.addRow(["", `उप-जम्मा / Sub-total — ${sanitizeCell(disc.name)}`, "", "", "", NRS(disc.subtotal)]);
    ws.mergeCells(`A${stRow.number}:E${stRow.number}`);
    stRow.eachCell((c) => applyGovtTotalRow(c));
    stRow.getCell(1).alignment = { horizontal: "right" };
    stRow.getCell(6).alignment = { horizontal: "right" };
  }

  // ── Totals Section ───────────────────────────────────────────────────────
  ws.addRow([]);

  const addSummaryRow = (label: string, value: string, isBold = false) => {
    const r = ws.addRow(["", "", "", "", label, value]);
    ws.mergeCells(`A${r.number}:D${r.number}`);
    r.getCell(5).font = { bold: isBold, size: 10 };
    r.getCell(5).border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
    r.getCell(5).alignment = { horizontal: "right" };
    r.getCell(6).font = { bold: isBold, size: 10 };
    r.getCell(6).border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
    r.getCell(6).alignment = { horizontal: "right" };
  };

  addSummaryRow("कुल जम्मा / Grand Total", NRS(boq.grandTotal));

  if (boq.contingencyAmount > 0) {
    addSummaryRow(`आकस्मिक खर्च / Contingency (${boq.project.contingencyPct ?? 0}%)`, NRS(boq.contingencyAmount));
  }
  if (boq.provisionalSum > 0) {
    addSummaryRow("अनुमानित योग / Provisional Sum", NRS(boq.provisionalSum));
  }

  const vatRate = boq.project.vatRate ?? 13;
  const vatAmount = boq.vatAmount > 0 ? boq.vatAmount : 0;
  if (vatAmount > 0) {
    addSummaryRow(`मूल्य अभिवृद्धि कर / VAT (${vatRate}%)`, NRS(vatAmount));
  }

  const finalRow = ws.addRow(["", "", "", "", "जम्मा भुक्तानी / Total Payable", NRS(boq.finalPayable)]);
  ws.mergeCells(`A${finalRow.number}:D${finalRow.number}`);
  applyGovtGrandTotal(finalRow.getCell(5));
  applyGovtGrandTotal(finalRow.getCell(6));
  finalRow.height = 20;

  // ── Signature Block ──────────────────────────────────────────────────────
  ws.addRow([]);
  ws.addRow([]);

  const today = new Date().toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" });
  const dateRow = ws.addRow([`मिति / Date: ${today}`]);
  ws.mergeCells(`A${dateRow.number}:F${dateRow.number}`);
  dateRow.getCell(1).font = { size: 10 };

  ws.addRow([]);
  ws.addRow([]);

  const sig = ws.addRow([
    "तयार गर्ने / Prepared by",
    "",
    "जाँच गर्ने / Checked by",
    "",
    "स्वीकृत गर्ने / Approved by",
    "",
  ]);
  sig.eachCell((c) => { c.font = { bold: true, size: 10 }; c.alignment = { horizontal: "center" }; });

  ws.addRow([]);
  ws.addRow([]);

  const sig2 = ws.addRow([
    meta.preparedBy ?? "___________________",
    "",
    meta.checkedBy ?? "___________________",
    "",
    meta.approvedBy ?? "___________________",
    "",
  ]);
  sig2.eachCell((c) => { c.font = { size: 10 }; c.alignment = { horizontal: "center" }; });

  const sigTitle = ws.addRow([
    "Estimator / Junior Engineer",
    "",
    "Sub-Engineer / Overseer",
    "",
    "कार्यकारी अभियन्ता / Executive Engineer",
    "",
  ]);
  sigTitle.eachCell((c) => { c.font = { size: 9, italic: true, color: { argb: "FF6B7280" } }; c.alignment = { horizontal: "center" }; });

  ws.addRow([]);
  const disclaimer = ws.addRow(["* यो लागत अनुमान DUDBC मापदण्ड अनुसार तयार गरिएको हो। / This BOQ is prepared as per DUDBC standard specifications."]);
  ws.mergeCells(`A${disclaimer.number}:F${disclaimer.number}`);
  disclaimer.getCell(1).font = { size: 9, italic: true, color: { argb: "FF6B7280" } };

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}
