import ExcelJS from "exceljs";
import type { BOQDocument, BOQGroup } from "./boq";
import { fmtNum } from "./format";

// ─── Procurement export types ─────────────────────────────────────────────────

export interface ResourceLineForExport {
  lineType: string;
  qtyPerUnit: number;
  wastagePercent: number;
  resource: {
    id: string;
    name: string;
    unit: string;
    unitRate: number;
    category: string;
  };
}

export interface RateItemForExport {
  rateItemId: string;
  code: string;
  description: string;
  unit: string;
  currentBaseRate: number;
  lines: ResourceLineForExport[];
}

export interface ProcurementExportData {
  rateItems: RateItemForExport[];
  settings: {
    overheadPct: number;
    profitPct: number;
    contingencyPct: number;
    leadLiftPct: number;
  };
  settingsAreDefaults?: boolean;
}

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

export function sanitizeCell(s: string): string {
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

// ─── Excel formula helpers (exported for testing) ────────────────────────────

/**
 * Returns the Excel qty formula for a single measurement-book item row.
 * Column layout across all sheets: C=No., D=Length, E=Breadth, F=Height.
 * Returns null when no dimensions are present (COUNT, AREA items, etc.).
 */
export function itemQtyFormula(
  rowNum: number,
  hasLength: boolean,
  hasBreadth: boolean,
  hasHeight: boolean,
): string | null {
  if (hasLength && hasBreadth && hasHeight) return `=C${rowNum}*D${rowNum}*E${rowNum}*F${rowNum}`;
  if (hasLength && hasBreadth)              return `=C${rowNum}*D${rowNum}*E${rowNum}`;
  if (hasLength && hasHeight)               return `=C${rowNum}*D${rowNum}*F${rowNum}`;
  if (hasLength)                            return `=C${rowNum}*D${rowNum}`;
  return null;
}

/**
 * Returns the group-total qty formula: =SUM(col{first}:col{last}) × groupMultiplier × conversionFactor.
 * `qtyCol` is the column letter holding item quantities (G for Detail/MB/Procurement, D for Govt format).
 */
export function groupQtyFormula(
  firstRow: number,
  lastRow: number,
  qtyCol: string,
  groupMultiplier: number,
  conversionFactor: number,
): string {
  const sumExpr = `SUM(${qtyCol}${firstRow}:${qtyCol}${lastRow})`;
  const factors: string[] = [];
  if (groupMultiplier !== 1) factors.push(`${groupMultiplier}`);
  if (conversionFactor !== 1) factors.push(conversionFactor.toFixed(9));
  return `=${sumExpr}${factors.length > 0 ? `*${factors.join("*")}` : ""}`;
}

// ─── BOQ Excel Export ─────────────────────────────────────────────────────────

const DEFAULT_COL_CONFIG: ExportColConfig = {
  showSno: true, showUnit: true, showQty: true, showRate: true, showAmount: true,
};

export async function buildBOQExcel(
  boq: BOQDocument,
  cols: ExportColConfig = DEFAULT_COL_CONFIG,
  procurement?: ProcurementExportData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estimate Nepal";
  wb.created = new Date();

  const customCols = cols.customCols ?? [];
  const totalCols = 6 + customCols.length;
  const lastColLetter = colLetter(totalCols);

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
    ...customCols.map(sanitizeCell),
  ]);
  hdr.eachCell((c) => applyHeaderStyle(c));
  hdr.height = 20;

  const subtotalRowNums: number[] = [];
  let sno = 1;

  for (const disc of boq.disciplines) {
    // Discipline row
    const dRow = summary.addRow([sanitizeCell(disc.name.toUpperCase())]);
    summary.mergeCells(`A${dRow.number}:${lastColLetter}${dRow.number}`);
    dRow.eachCell((c) => applyDisciplineStyle(c));
    dRow.height = 18;

    let firstGrpRowNum: number | null = null;
    let lastGrpRowNum: number | null = null;
    let dSno = 1;
    for (const grp of disc.groups) {
      const qtyValue = grp.conversionFactor !== 1
        ? { formula: `=${grp.originalQuantity.toFixed(6)}*${grp.conversionFactor.toFixed(9)}`, result: grp.totalQuantity }
        : grp.totalQuantity;
      const gRow = summary.addRow([`${sno}.${dSno}`, sanitizeCell(grp.name), grp.unit, qtyValue, grp.rate, grp.amount]);
      gRow.eachCell((c) => { applyGroupStyle(c); borderAll(c); });

      // Track for SUM formula
      if (firstGrpRowNum === null) firstGrpRowNum = gRow.number;
      lastGrpRowNum = gRow.number;

      // Yellow for overridden rate
      if (grp.isOverridden) {
        applyOverrideStyle(gRow.getCell(5));
      }

      gRow.getCell(4).alignment = { horizontal: "right" };
      gRow.getCell(5).alignment = { horizontal: "right" };
      gRow.getCell(6).alignment = { horizontal: "right" };
      gRow.getCell(6).numFmt = '#,##0.00';   // Amount (NRS) — 2dp standard for currency
      gRow.getCell(5).numFmt = '#,##0.000';  // Rate
      gRow.getCell(4).numFmt = '#,##0.000';  // Quantity

      // Amount formula (overwrites the literal grp.amount)
      gRow.getCell(6).value = { formula: `=D${gRow.number}*E${gRow.number}`, result: grp.amount };

      if (grp.conversionFactor !== 1) {
        gRow.getCell(4).note = `Measured: ${grp.originalQuantity.toFixed(3)} ${grp.originalUnit}\nConverted: ${grp.totalQuantity.toFixed(3)} ${grp.unit}\n1 ${grp.originalUnit} = ${grp.conversionFactor.toFixed(6)} ${grp.unit}`;
        gRow.getCell(3).note = `Converted from ${grp.originalUnit} → ${grp.unit}\nFactor: 1 ${grp.originalUnit} = ${grp.conversionFactor.toFixed(6)} ${grp.unit}`;
      }

      dSno++;
    }

    // Discipline subtotal
    const subtotalValue = firstGrpRowNum !== null && lastGrpRowNum !== null
      ? { formula: `=SUM(F${firstGrpRowNum}:F${lastGrpRowNum})`, result: disc.subtotal }
      : disc.subtotal;
    const stRow = summary.addRow([`${disc.name} Sub-Total`, "", "", "", "", subtotalValue]);
    summary.mergeCells(`A${stRow.number}:E${stRow.number}`);
    stRow.eachCell((c) => applyTotalStyle(c));
    stRow.getCell(6).numFmt = '#,##0.00';  // Discipline subtotal is an NRS amount
    stRow.getCell(6).alignment = { horizontal: "right" };
    subtotalRowNums.push(stRow.number);

    summary.addRow([]);
    sno++;
  }

  // Financial summary
  summary.addRow([]);
  const addFinRow = (label: string, value: number, bold = false) => {
    const r = summary.addRow([label, "", "", "", "", value]);
    summary.mergeCells(`A${r.number}:E${r.number}`);
    r.getCell(1).font = { bold, size: 10 };
    r.getCell(1).alignment = { horizontal: "right" };
    r.getCell(6).numFmt = '#,##0.00';
    r.getCell(6).alignment = { horizontal: "right" };
    r.getCell(6).font = { bold };
    return r;
  };

  // Grand Total = SUM of all discipline subtotals
  const grandTotalRow = addFinRow("Grand Total", boq.grandTotal, true);
  if (subtotalRowNums.length > 0) {
    const refs = subtotalRowNums.map(n => `F${n}`).join("+");
    grandTotalRow.getCell(6).value = { formula: `=${refs}`, result: boq.grandTotal };
  }
  const gtRowNum = grandTotalRow.number;

  // Track row numbers for building base formula
  let contingencyRowNum: number | null = null;
  let provisionalRowNum: number | null = null;
  let vatRowNum: number | null = null;
  let tdsRowNum: number | null = null;

  // Contingency = Grand Total × pct%
  if (boq.project.contingencyPct > 0) {
    const contRow = addFinRow(
      `Contingency (${boq.project.contingencyPct}%)`,
      boq.contingencyAmount,
    );
    contingencyRowNum = contRow.number;
    contRow.getCell(6).value = {
      formula: `=F${gtRowNum}*${boq.project.contingencyPct}/100`,
      result: boq.contingencyAmount,
    };
  }

  // Provisional Sum — user-configured value, no formula needed
  if (boq.provisionalSum > 0) {
    const provRow = addFinRow("Provisional Sum", boq.provisionalSum);
    provisionalRowNum = provRow.number;
  }

  // Build "subtotalAfterAdditions" cell reference list (grand total + contingency + provisional)
  // System: subtotalAfterAdditions = grandTotal + contingencyAmount + provisionalSum
  const saaRefs = ([gtRowNum, contingencyRowNum, provisionalRowNum] as (number | null)[])
    .filter((n): n is number => n !== null)
    .map(n => `F${n}`)
    .join("+");

  // VAT = subtotalAfterAdditions × vatRate%
  if (boq.project.vatEnabled) {
    const vatRow = addFinRow(`VAT (${boq.project.vatRate}%)`, boq.vatAmount);
    vatRowNum = vatRow.number;
    vatRow.getCell(6).value = {
      formula: `=(${saaRefs})*${boq.project.vatRate}/100`,
      result: boq.vatAmount,
    };
  }

  // TDS = subtotalAfterAdditions × tdsRate% (shown as deduction — negative)
  if (boq.project.tdsEnabled) {
    const tdsRow = addFinRow(`TDS (${boq.project.tdsRate}%)`, -boq.tdsAmount);
    tdsRowNum = tdsRow.number;
    tdsRow.getCell(6).value = {
      formula: `=-(${saaRefs})*${boq.project.tdsRate}/100`,
      result: -boq.tdsAmount,
    };
  }

  // Final Payable = subtotalAfterAdditions + vatAmount - tdsAmount
  // Since tds row already has negative value, summing all rows gives the correct result
  const finalRefs = ([gtRowNum, contingencyRowNum, provisionalRowNum, vatRowNum, tdsRowNum] as (number | null)[])
    .filter((n): n is number => n !== null)
    .map(n => `F${n}`)
    .join("+");
  const finalPayableRow = addFinRow("FINAL PAYABLE (NRS)", boq.finalPayable, true);
  finalPayableRow.getCell(6).value = {
    formula: `=${finalRefs}`,
    result: boq.finalPayable,
  };

  // ── Detail Sheets (one per discipline) ────────────────────────────────────
  // Drawing unit is the linear unit used for L/B/H dimension columns (ft for imperial, m for metric).
  const drawingUnit = (boq.project.unitSystem ?? "imperial").toLowerCase().includes("metric") ? "m" : "ft";

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

    const dHdr = ws.addRow(["S.No.", "Description", "No.", `Length (${drawingUnit})`, `Breadth (${drawingUnit})`, `Height (${drawingUnit})`, "Quantity", "Unit", "Rate (NRS)", "Amount (NRS)"]);
    dHdr.eachCell((c) => applyHeaderStyle(c));
    dHdr.height = 20;

    let lineNo = 1;
    const grpAmtRowNums: number[] = [];  // for discipline subtotal SUM formula
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

      // Item sub-rows — always write multiplier as a number (1 instead of null) so qty formula
      // can reference col C. Formula: =No.*Length*Breadth*Height (only present dims included).
      let firstItemRowNum: number | null = null;
      let lastItemRowNum: number | null = null;
      for (const item of grp.items) {
        const iRow = ws.addRow([
          "",
          `  ${item.label}`,
          item.multiplier,             // always numeric (shows "1" instead of blank)
          item.length ?? null,
          item.breadth ?? null,
          item.height ?? null,
          item.quantity,
          item.unit,
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
        iRow.getCell(3).numFmt = '#,##0.###';  // No. — suppress trailing zeros on integers
        iRow.getCell(4).numFmt = '#,##0.000';  // Length
        iRow.getCell(5).numFmt = '#,##0.000';  // Breadth
        iRow.getCell(6).numFmt = '#,##0.000';  // Height
        iRow.getCell(7).numFmt = '#,##0.000';  // Quantity

        // Qty formula — C=No., D=Length, E=Breadth, F=Height; only factors present are included
        const rn = iRow.number;
        const qtyFml = itemQtyFormula(rn, item.length != null, item.breadth != null, item.height != null);
        if (qtyFml) iRow.getCell(7).value = { formula: qtyFml, result: item.quantity };

        if (firstItemRowNum === null) firstItemRowNum = rn;
        lastItemRowNum = rn;
      }

      // Group total row — SUM of item qty cells × groupMultiplier × unit conversion factor
      const safeTotal = Number.isFinite(grp.totalQuantity) ? grp.totalQuantity : 0;
      const cf = grp.conversionFactor;
      const gm = grp.groupMultiplier;
      let totalQtyValue: number | { formula: string; result: number };
      if (firstItemRowNum !== null && lastItemRowNum !== null) {
        totalQtyValue = { formula: groupQtyFormula(firstItemRowNum, lastItemRowNum, "G", gm, cf), result: safeTotal };
      } else {
        totalQtyValue = safeTotal;
      }

      const totalLabel = cf !== 1
        ? `Total — ${sanitizeCell(grp.name)}  [${grp.originalUnit} → ${grp.unit}]`
        : `Total — ${sanitizeCell(grp.name)}`;
      const tRow = ws.addRow([
        "", totalLabel, "", "", "", "",
        totalQtyValue, grp.unit, grp.rate, grp.amount,
      ]);
      tRow.eachCell((c) => applyTotalStyle(c));
      tRow.getCell(7).numFmt = '#,##0.000';  // Quantity
      tRow.getCell(9).numFmt = '#,##0.000';  // Rate
      tRow.getCell(10).numFmt = '#,##0.00';  // Amount (NRS) — 2dp standard for currency
      if (grp.isOverridden) applyOverrideStyle(tRow.getCell(9));

      // Amount formula
      const tRowNum = tRow.number;
      tRow.getCell(10).value = { formula: `=G${tRowNum}*I${tRowNum}`, result: grp.amount };
      grpAmtRowNums.push(tRowNum);

      // Unit note for clarity
      if (cf !== 1) {
        tRow.getCell(8).note = `Unit after conversion: ${grp.unit}\nOriginal measurement unit: ${grp.originalUnit}\nFactor: 1 ${grp.originalUnit} = ${cf.toFixed(6)} ${grp.unit}`;
      }

      ws.addRow([]);
      lineNo++;
    }

    // Discipline subtotal — formula references each group total's amount cell (col J)
    const stRow = ws.addRow([`${sanitizeCell(disc.name)} — Sub-Total`, "", "", "", "", "", "", "", "", disc.subtotal]);
    ws.mergeCells(`A${stRow.number}:I${stRow.number}`);
    stRow.eachCell((c) => applyTotalStyle(c));
    stRow.getCell(10).numFmt = '#,##0.00';  // Discipline subtotal amount (NRS)
    stRow.getCell(10).alignment = { horizontal: "right" };
    if (grpAmtRowNums.length > 0) {
      stRow.getCell(10).value = {
        formula: `=${grpAmtRowNums.map(n => `J${n}`).join("+")}`,
        result: disc.subtotal,
      };
    }
  }

  // ── Sheets 3–6: Rate Analysis + Procurement Schedules ────────────────────
  if (procurement && procurement.rateItems.length > 0) {
    addRateAnalysisSheet(wb, boq, procurement);
    addProcurementSheet(wb, boq, procurement, "MATERIAL",  "Material Procurement");
    addProcurementSheet(wb, boq, procurement, "LABOUR",    "Labour Schedule");
    addProcurementSheet(wb, boq, procurement, "EQUIPMENT", "Equipment Schedule");
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

  const mbDrawingUnit = (boq.project.unitSystem ?? "imperial").toLowerCase().includes("metric") ? "m" : "ft";
  const hdr = ws.addRow(["S.No.", "Description", "No.", `Length (${mbDrawingUnit})`, `Breadth (${mbDrawingUnit})`, `Height (${mbDrawingUnit})`, "Quantity", "Unit", "Site Location", "Measured Date", "Remarks"]);
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

      // Item rows — always write multiplier as number so qty formula can reference col C
      let mbFirstItemRow: number | null = null;
      let mbLastItemRow: number | null = null;
      for (const item of grp.items) {
        const iRow = ws.addRow([
          "",
          `  ${item.label}`,
          item.multiplier,             // always numeric
          item.length ?? null,
          item.breadth ?? null,
          item.height ?? null,
          item.quantity,
          item.unit,
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
        iRow.getCell(3).numFmt = '#,##0.###';  // No. — suppress trailing zeros
        iRow.getCell(4).numFmt = '#,##0.000';  // Length
        iRow.getCell(5).numFmt = '#,##0.000';  // Breadth
        iRow.getCell(6).numFmt = '#,##0.000';  // Height
        iRow.getCell(7).numFmt = '#,##0.000';  // Quantity

        // Qty formula: C=No., D=Length, E=Breadth, F=Height
        const rn = iRow.number;
        const mbQtyFml = itemQtyFormula(rn, item.length != null, item.breadth != null, item.height != null);
        if (mbQtyFml) iRow.getCell(7).value = { formula: mbQtyFml, result: item.quantity };

        if (mbFirstItemRow === null) mbFirstItemRow = rn;
        mbLastItemRow = rn;
      }

      const safeTotalMB = Number.isFinite(grp.totalQuantity) ? grp.totalQuantity : 0;
      const cfMB = grp.conversionFactor;
      const gmMB = grp.groupMultiplier;
      let mbQtyValue: number | { formula: string; result: number };
      if (mbFirstItemRow !== null && mbLastItemRow !== null) {
        mbQtyValue = { formula: groupQtyFormula(mbFirstItemRow, mbLastItemRow, "G", gmMB, cfMB), result: safeTotalMB };
      } else {
        mbQtyValue = safeTotalMB;
      }

      const mbTotalLabel = cfMB !== 1
        ? `Total — ${sanitizeCell(grp.name)}  [${grp.originalUnit} → ${grp.unit}]`
        : `Total — ${sanitizeCell(grp.name)}`;
      const tRow = ws.addRow([
        "", mbTotalLabel, "", "", "", "", mbQtyValue, grp.unit,
      ]);
      tRow.eachCell((c) => applyTotalStyle(c));
      tRow.getCell(7).numFmt = '#,##0.000';
      if (cfMB !== 1) {
        tRow.getCell(8).note = `Unit after conversion: ${grp.unit}\nOriginal measurement unit: ${grp.originalUnit}\nFactor: 1 ${grp.originalUnit} = ${cfMB.toFixed(6)} ${grp.unit}`;
      }
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
  const htmlDrawingUnit = (boq.project.unitSystem ?? "imperial").toLowerCase().includes("metric") ? "m" : "ft";

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
        <td>${item.unit || grp.originalUnit || grp.unit}</td>
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
        <th scope="col" style="width:6%">S.No.</th>
        <th scope="col" style="width:30%">Description of Work</th>
        <th scope="col" style="width:5%">No.</th>
        <th scope="col" style="width:8%">Length (${htmlDrawingUnit})</th>
        <th scope="col" style="width:8%">Breadth (${htmlDrawingUnit})</th>
        <th scope="col" style="width:8%">Height (${htmlDrawingUnit})</th>
        <th scope="col" style="width:9%">Quantity</th>
        <th scope="col" style="width:6%">Unit</th>
        <th scope="col" style="width:10%">Rate (NRS)</th>
        <th scope="col" style="width:10%">Amount (NRS)</th>
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
    ws.mergeCells(`A${row.number}:${String.fromCharCode(64 + COLS)}${row.number}`);
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
  const govtDiscSubRowNums: number[] = [];  // for grand total SUM formula

  for (const disc of boq.disciplines) {
    // Discipline row
    const dRow = ws.addRow([sanitizeCell(disc.name.toUpperCase()), "", "", "", "", ""]);
    ws.mergeCells(`A${dRow.number}:F${dRow.number}`);
    dRow.eachCell((c) => applyGovtGroupRow(c));
    dRow.height = 16;

    const govtGrpTotalRowNums: number[] = [];  // for discipline subtotal SUM formula

    for (const grp of disc.groups) {
      const cfGovt = grp.conversionFactor;

      // Group header row — amount placeholder; updated to =F{tRowNum} after total row is created
      const gRow = ws.addRow([`${sno}.`, sanitizeCell(grp.name), sanitizeCell(grp.unit), "", grp.rate, grp.amount]);
      gRow.eachCell((c) => applyGovtGroupRow(c));
      gRow.getCell(1).alignment = { horizontal: "center" };
      gRow.getCell(4).alignment = { horizontal: "right" };
      gRow.getCell(5).alignment = { horizontal: "right" };
      gRow.getCell(6).alignment = { horizontal: "right" };
      gRow.height = 16;
      gRow.getCell(5).numFmt = '#,##0.000';  // Rate
      gRow.getCell(6).numFmt = '#,##0.00';   // Amount (NRS) — 2dp; updated to =F{totalRow} below
      if (cfGovt !== 1) {
        gRow.getCell(3).note = `Unit: ${grp.unit} (converted from ${grp.originalUnit})\nFactor: 1 ${grp.originalUnit} = ${cfGovt.toFixed(6)} ${grp.unit}`;
      }

      // Sub-items — track rows for group total SUM (qty in col D)
      let firstGovtItemRow: number | null = null;
      let lastGovtItemRow: number | null = null;
      for (const item of grp.items) {
        const iRow = ws.addRow(["", sanitizeCell(`  ${item.label}`), sanitizeCell(item.unit || grp.originalUnit || grp.unit), item.quantity, "", ""]);
        iRow.eachCell((c) => applyGovtItemRow(c));
        iRow.getCell(4).alignment = { horizontal: "right" };
        iRow.getCell(4).numFmt = '#,##0.000';
        if (firstGovtItemRow === null) firstGovtItemRow = iRow.number;
        lastGovtItemRow = iRow.number;
      }

      // Group total — SUM of item D cells × groupMultiplier × unit conversion factor
      const gmGovt = grp.groupMultiplier;
      let govtQtyValue: number | { formula: string; result: number };
      if (firstGovtItemRow !== null && lastGovtItemRow !== null) {
        govtQtyValue = { formula: groupQtyFormula(firstGovtItemRow, lastGovtItemRow, "D", gmGovt, cfGovt), result: grp.totalQuantity };
      } else {
        // No items — originalQuantity already includes groupMultiplier; only cf remains
        govtQtyValue = cfGovt !== 1
          ? { formula: `=${grp.originalQuantity.toFixed(6)}*${cfGovt.toFixed(9)}`, result: grp.totalQuantity }
          : grp.totalQuantity;
      }

      const govtTotalLabel = cfGovt !== 1
        ? `जम्मा / Total  [${grp.originalUnit} → ${grp.unit}]`
        : "जम्मा / Total";
      const tRow = ws.addRow(["", govtTotalLabel, sanitizeCell(grp.unit), govtQtyValue, grp.rate, grp.amount]);
      tRow.eachCell((c) => applyGovtTotalRow(c));
      tRow.getCell(2).alignment = { horizontal: "right" };
      tRow.getCell(4).alignment = { horizontal: "right" };
      tRow.getCell(5).alignment = { horizontal: "right" };
      tRow.getCell(6).alignment = { horizontal: "right" };
      tRow.getCell(5).numFmt = '#,##0.000';  // Rate
      const tRowNum = tRow.number;
      tRow.getCell(6).value = { formula: `=D${tRowNum}*E${tRowNum}`, result: grp.amount };
      tRow.getCell(6).numFmt = '#,##0.00';   // Amount (NRS) — 2dp standard for currency
      if (cfGovt !== 1) {
        tRow.getCell(3).note = `Unit: ${grp.unit} (converted from ${grp.originalUnit})\nFactor: 1 ${grp.originalUnit} = ${cfGovt.toFixed(6)} ${grp.unit}`;
      }

      // Update group header amount to reference total row (forward reference)
      gRow.getCell(6).value = { formula: `=F${tRowNum}`, result: grp.amount };
      govtGrpTotalRowNums.push(tRowNum);

      sno++;
    }

    // Discipline subtotal — formula references each group total row's amount (col F)
    const stRow = ws.addRow([`उप-जम्मा / Sub-total — ${sanitizeCell(disc.name)}`, "", "", "", "", 0]);
    ws.mergeCells(`A${stRow.number}:E${stRow.number}`);
    stRow.eachCell((c) => applyGovtTotalRow(c));
    stRow.getCell(1).alignment = { horizontal: "right" };
    stRow.getCell(6).alignment = { horizontal: "right" };
    stRow.getCell(6).numFmt = '#,##0.00';
    if (govtGrpTotalRowNums.length > 0) {
      stRow.getCell(6).value = {
        formula: `=${govtGrpTotalRowNums.map(n => `F${n}`).join("+")}`,
        result: disc.subtotal,
      };
    } else {
      stRow.getCell(6).value = disc.subtotal;
    }
    govtDiscSubRowNums.push(stRow.number);
  }

  // ── Totals Section ───────────────────────────────────────────────────────
  ws.addRow([]);

  // Helper: writes a numeric formula row (not a string) so Excel can compute on it
  const addGovtNumericRow = (label: string, isBold = false) => {
    const r = ws.addRow(["", "", "", "", label, 0]);
    ws.mergeCells(`A${r.number}:D${r.number}`);
    r.getCell(5).font = { bold: isBold, size: 10 };
    r.getCell(5).border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
    r.getCell(5).alignment = { horizontal: "right" };
    r.getCell(6).font = { bold: isBold, size: 10 };
    r.getCell(6).border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
    r.getCell(6).alignment = { horizontal: "right" };
    r.getCell(6).numFmt = '#,##0.00';
    return r;
  };

  // Grand Total — sums all discipline subtotal rows
  const govtGTRow = addGovtNumericRow("कुल जम्मा / Grand Total");
  const govtGTFormula = govtDiscSubRowNums.length > 0
    ? `=${govtDiscSubRowNums.map(n => `F${n}`).join("+")}`
    : `=${boq.grandTotal.toFixed(2)}`;
  govtGTRow.getCell(6).value = { formula: govtGTFormula, result: boq.grandTotal };
  const govtGTRowNum = govtGTRow.number;

  let govtContRowNum: number | null = null;
  let govtProvRowNum: number | null = null;
  let govtVatRowNum: number | null = null;

  if (boq.contingencyAmount > 0) {
    const cRow = addGovtNumericRow(`आकस्मिक खर्च / Contingency (${boq.project.contingencyPct ?? 0}%)`);
    cRow.getCell(6).value = {
      formula: `=F${govtGTRowNum}*${boq.project.contingencyPct ?? 0}/100`,
      result: boq.contingencyAmount,
    };
    govtContRowNum = cRow.number;
  }
  if (boq.provisionalSum > 0) {
    const pRow = addGovtNumericRow("अनुमानित योग / Provisional Sum");
    pRow.getCell(6).value = boq.provisionalSum;
    govtProvRowNum = pRow.number;
  }

  const vatRate = boq.project.vatRate ?? 13;
  const vatAmount = boq.vatAmount > 0 ? boq.vatAmount : 0;
  if (vatAmount > 0) {
    const govtSaaRefs = ([govtGTRowNum, govtContRowNum, govtProvRowNum] as (number | null)[])
      .filter((n): n is number => n !== null)
      .map(n => `F${n}`)
      .join("+");
    const vRow = addGovtNumericRow(`मूल्य अभिवृद्धि कर / VAT (${vatRate}%)`);
    vRow.getCell(6).value = { formula: `=(${govtSaaRefs})*${vatRate}/100`, result: vatAmount };
    govtVatRowNum = vRow.number;
  }

  // Final Payable — sums grand total + contingency + provisional + VAT
  const govtFinalRefs = ([govtGTRowNum, govtContRowNum, govtProvRowNum, govtVatRowNum] as (number | null)[])
    .filter((n): n is number => n !== null)
    .map(n => `F${n}`)
    .join("+");
  const finalRow = ws.addRow(["", "", "", "", "जम्मा भुक्तानी / Total Payable", 0]);
  ws.mergeCells(`A${finalRow.number}:D${finalRow.number}`);
  applyGovtGrandTotal(finalRow.getCell(5));
  applyGovtGrandTotal(finalRow.getCell(6));
  finalRow.getCell(6).numFmt = '#,##0.00';
  // Govt format does not deduct TDS (that is withheld by the paying authority separately).
  // result must match what the formula computes: GT + contingency + provisional + VAT.
  const govtFinalPayable = boq.subtotalAfterAdditions + boq.vatAmount;
  finalRow.getCell(6).value = { formula: `=${govtFinalRefs}`, result: govtFinalPayable };
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

  const govtBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(govtBuf);
}

// ─── Sheet 3: Rate Analysis Schedule ─────────────────────────────────────────
// Shows the DUDBC formula breakdown for each rate item that has resource lines.
// Uses cell references so formula bar proves the math matches the system.

function addRateAnalysisSheet(
  wb: ExcelJS.Workbook,
  boq: BOQDocument,
  procurement: ProcurementExportData,
): void {
  const ws = wb.addWorksheet("Rate Analysis Schedule");
  const { settings } = procurement;

  // Build a set of rateItemIds actually used in the BOQ (in order of first appearance)
  const usedIds: string[] = [];
  const usedSet = new Set<string>();
  for (const disc of boq.disciplines) {
    for (const grp of disc.groups) {
      if (grp.rateItemId && !usedSet.has(grp.rateItemId)) {
        usedIds.push(grp.rateItemId);
        usedSet.add(grp.rateItemId);
      }
    }
  }

  // Index procurement data by rateItemId
  const rateMap = new Map(procurement.rateItems.map(r => [r.rateItemId, r]));

  ws.columns = [
    { key: "resource", width: 30 },
    { key: "type",     width: 12 },
    { key: "unit",     width: 10 },
    { key: "qty",      width: 12 },
    { key: "wastage",  width: 10 },
    { key: "rate",     width: 14 },
    { key: "cost",     width: 16 },
  ];

  // Sheet title
  const titleRow = ws.addRow([`RATE ANALYSIS SCHEDULE — ${boq.project.name.toUpperCase()}`]);
  ws.mergeCells(`A${titleRow.number}:G${titleRow.number}`);
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 24;

  const subtitleRow = ws.addRow([
    `DUDBC Formula: lineCost = Qty × Rate × (1 + Wastage%)  |  Direct + Overhead(${settings.overheadPct}%) + Profit(${settings.profitPct}%) + Contingency(${settings.contingencyPct}%) + Lead&Lift(${settings.leadLiftPct}%) = Pre-VAT Base Rate`
  ]);
  ws.mergeCells(`A${subtitleRow.number}:G${subtitleRow.number}`);
  subtitleRow.getCell(1).font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  subtitleRow.getCell(1).alignment = { horizontal: "center" };

  if (procurement.settingsAreDefaults) {
    const warnRow = ws.addRow(["WARNING: Org rate settings are not configured — DUDBC standard defaults used (Overhead 12%, Profit 10%, Contingency 5%, Lead & Lift 0%)"]);
    ws.mergeCells(`A${warnRow.number}:G${warnRow.number}`);
    warnRow.getCell(1).font = { bold: true, size: 9, color: { argb: "FF92400E" } };
    warnRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    warnRow.getCell(1).alignment = { horizontal: "center" };
  }

  ws.addRow([]);

  let itemSno = 1;
  for (const rateItemId of usedIds) {
    const item = rateMap.get(rateItemId);
    if (!item || item.lines.length === 0) {
      const boqGroup = boq.disciplines.flatMap(d => d.groups).find(g => g.rateItemId === rateItemId);
      const label = item
        ? `${item.code} — No analysis lines configured for this org`
        : `${boqGroup?.name ?? rateItemId} — Rate item not found or no analysis lines configured`;
      const noteRow = ws.addRow([label, "", "", "", "", "", ""]);
      ws.mergeCells(`A${noteRow.number}:G${noteRow.number}`);
      noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF92400E" } };
      noteRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      noteRow.getCell(1).alignment = { horizontal: "left" };
      ws.addRow([]);
      itemSno++;
      continue;
    }

    // Item header
    const itemHdr = ws.addRow([
      `${itemSno}. ${item.code} — ${item.description}`,
      "", "", "", "", "", `Unit: ${item.unit}`,
    ]);
    ws.mergeCells(`A${itemHdr.number}:F${itemHdr.number}`);
    itemHdr.eachCell(c => {
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    });
    itemHdr.getCell(7).font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    itemHdr.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    itemHdr.getCell(7).alignment = { horizontal: "right" };
    itemHdr.height = 18;

    // Column headers — "Qty per Cu.m." (or whichever BOQ unit) makes the cross-unit context explicit
    const colHdr = ws.addRow(["Resource / Material", "Type", "Unit", `Qty per ${item.unit || "unit"}`, "Wastage%", "Unit Rate (NRS)", "Line Cost (NRS)"]);
    colHdr.eachCell(c => applyHeaderStyle(c));
    colHdr.height = 18;

    // Resource lines
    const lineCostCellRefs: string[] = [];

    for (const line of item.lines) {
      const row = ws.addRow([
        sanitizeCell(line.resource.name),
        line.lineType,
        line.resource.unit,
        line.qtyPerUnit,
        line.wastagePercent,
        line.resource.unitRate,
        null, // filled by formula below
      ]);

      // D = Qty/Unit (col 4), E = Wastage% (col 5), F = Unit Rate (col 6), G = Line Cost (col 7)
      const rowNum = row.number;
      const costCell = row.getCell(7);
      const lineCostComputed = line.qtyPerUnit * line.resource.unitRate * (1 + line.wastagePercent / 100);
      costCell.value = { formula: `=D${rowNum}*F${rowNum}*(1+E${rowNum}/100)`, result: lineCostComputed };
      costCell.numFmt = "#,##0.000";

      row.getCell(4).numFmt = "#,##0.000";
      row.getCell(5).numFmt = "0.000";
      row.getCell(6).numFmt = "#,##0.000";
      row.eachCell(c => { borderAll(c); c.alignment = { vertical: "middle" }; });
      row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };

      lineCostCellRefs.push(`G${rowNum}`);
    }

    // Summary: Direct Cost
    const directCostVal = item.lines.reduce((s, l) => s + l.qtyPerUnit * l.resource.unitRate * (1 + l.wastagePercent / 100), 0);
    const directRow = ws.addRow(["Direct Cost", "", "", "", "", "", null]);
    ws.mergeCells(`A${directRow.number}:F${directRow.number}`);
    directRow.getCell(1).font = { bold: true, size: 10 };
    directRow.getCell(1).alignment = { horizontal: "right" };
    const directCell = directRow.getCell(7);
    directCell.value = { formula: `=SUM(${lineCostCellRefs.join(",")})`, result: directCostVal };
    directCell.numFmt = "#,##0.000";
    directCell.font = { bold: true };
    directCell.alignment = { horizontal: "right" };
    applyTotalStyle(directCell);
    const directRef = `G${directRow.number}`;

    const overheadVal = directCostVal * (settings.overheadPct / 100);
    const overheadRow = ws.addRow([`Overhead (${settings.overheadPct}%)`, "", "", "", "", "", null]);
    ws.mergeCells(`A${overheadRow.number}:F${overheadRow.number}`);
    overheadRow.getCell(1).alignment = { horizontal: "right" };
    const overheadCell = overheadRow.getCell(7);
    overheadCell.value = { formula: `=${directRef}*${settings.overheadPct}/100`, result: overheadVal };
    overheadCell.numFmt = "#,##0.000";
    overheadCell.alignment = { horizontal: "right" };
    borderAll(overheadCell);
    const overheadRef = `G${overheadRow.number}`;

    const profitVal = (directCostVal + overheadVal) * (settings.profitPct / 100);
    const profitRow = ws.addRow([`Profit (${settings.profitPct}%)`, "", "", "", "", "", null]);
    ws.mergeCells(`A${profitRow.number}:F${profitRow.number}`);
    profitRow.getCell(1).alignment = { horizontal: "right" };
    const profitCell = profitRow.getCell(7);
    profitCell.value = { formula: `=(${directRef}+${overheadRef})*${settings.profitPct}/100`, result: profitVal };
    profitCell.numFmt = "#,##0.000";
    profitCell.alignment = { horizontal: "right" };
    borderAll(profitCell);
    const profitRef = `G${profitRow.number}`;

    const contingencyVal = (directCostVal + overheadVal + profitVal) * (settings.contingencyPct / 100);
    const contRow = ws.addRow([`Contingency (${settings.contingencyPct}%)`, "", "", "", "", "", null]);
    ws.mergeCells(`A${contRow.number}:F${contRow.number}`);
    contRow.getCell(1).alignment = { horizontal: "right" };
    const contCell = contRow.getCell(7);
    contCell.value = { formula: `=(${directRef}+${overheadRef}+${profitRef})*${settings.contingencyPct}/100`, result: contingencyVal };
    contCell.numFmt = "#,##0.000";
    contCell.alignment = { horizontal: "right" };
    borderAll(contCell);
    const contRef = `G${contRow.number}`;

    const leadLiftVal = directCostVal * (settings.leadLiftPct / 100);
    let leadRef = "";
    if (settings.leadLiftPct > 0) {
      const leadRow = ws.addRow([`Lead & Lift (${settings.leadLiftPct}%)`, "", "", "", "", "", null]);
      ws.mergeCells(`A${leadRow.number}:F${leadRow.number}`);
      leadRow.getCell(1).alignment = { horizontal: "right" };
      const leadCell = leadRow.getCell(7);
      leadCell.value = { formula: `=${directRef}*${settings.leadLiftPct}/100`, result: leadLiftVal };
      leadCell.numFmt = "#,##0.000";
      leadCell.alignment = { horizontal: "right" };
      borderAll(leadCell);
      leadRef = `G${leadRow.number}`;
    }

    const preVatVal = directCostVal + overheadVal + profitVal + contingencyVal + leadLiftVal;
    const preVatRow = ws.addRow(["Pre-VAT Rate (written to Base Rate)", "", "", "", "", "", null]);
    ws.mergeCells(`A${preVatRow.number}:F${preVatRow.number}`);
    preVatRow.getCell(1).font = { bold: true, size: 10 };
    preVatRow.getCell(1).alignment = { horizontal: "right" };
    const preVatCell = preVatRow.getCell(7);
    const preVatParts = [directRef, overheadRef, profitRef, contRef, leadRef].filter(Boolean);
    preVatCell.value = { formula: `=${preVatParts.join("+")}`, result: preVatVal };
    preVatCell.numFmt = "#,##0.000";
    preVatCell.font = { bold: true, size: 10, color: { argb: "FF1E3A5F" } };
    preVatCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    preVatCell.alignment = { horizontal: "right" };
    preVatCell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "medium" } };

    // Current base rate for comparison
    const baseRateRow = ws.addRow(["Current Base Rate in System", "", "", "", "", "", item.currentBaseRate]);
    ws.mergeCells(`A${baseRateRow.number}:F${baseRateRow.number}`);
    baseRateRow.getCell(1).font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };
    baseRateRow.getCell(1).alignment = { horizontal: "right" };
    baseRateRow.getCell(7).numFmt = "#,##0.000";
    baseRateRow.getCell(7).font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };
    baseRateRow.getCell(7).alignment = { horizontal: "right" };

    ws.addRow([]);
    itemSno++;
  }
}

// ─── Sheets 4–6: Procurement Schedules ───────────────────────────────────────
// Structure: sub-item rows per BOQ group with dimensions (No./L/B/H/Qty).
// Resource column formula: =G{rowNum}*qpu*(1+wst/100)
// G column (Quantity) is a live cell — editing it recalculates all resource cols.
// No cross-unit "Total" column — each resource is totalled independently at the bottom.

function addProcurementSheet(
  wb: ExcelJS.Workbook,
  boq: BOQDocument,
  procurement: ProcurementExportData,
  lineType: string,
  sheetName: string,
): void {
  // Collect all unique resources of this type, in order of first appearance
  const resourceMap = new Map<string, { id: string; name: string; unit: string }>();
  for (const item of procurement.rateItems) {
    for (const line of item.lines) {
      if (line.lineType === lineType && !resourceMap.has(line.resource.id)) {
        resourceMap.set(line.resource.id, {
          id: line.resource.id,
          name: line.resource.name,
          unit: line.resource.unit,
        });
      }
    }
  }

  const resources = Array.from(resourceMap.values());
  if (resources.length === 0) {
    const ws = wb.addWorksheet(sheetName);
    const emptyTitle = ws.addRow([`${sheetName.toUpperCase()} — ${boq.project.name.toUpperCase()}`]);
    ws.mergeCells(`A${emptyTitle.number}:D${emptyTitle.number}`);
    emptyTitle.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
    emptyTitle.getCell(1).alignment = { horizontal: "center" };
    const emptyRow = ws.addRow(["No lines of this resource type were found in the rate analysis for this project."]);
    ws.mergeCells(`A${emptyRow.number}:D${emptyRow.number}`);
    emptyRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    emptyRow.getCell(1).alignment = { horizontal: "center" };
    return;
  }

  const rateMap = new Map(procurement.rateItems.map(r => [r.rateItemId, r]));
  const procDrawingUnit = (boq.project.unitSystem ?? "imperial").toLowerCase().includes("metric") ? "m" : "ft";

  const ws = wb.addWorksheet(sheetName);

  // Fixed columns: S.No.(A) | Description(B) | No.(C) | Length(D) | Breadth(E) | Height(F) | Quantity(G) | Unit(H)
  const FIXED = 8;
  const QTY_COL = colLetter(7); // G — live Quantity cell referenced by resource formulas
  const totalCols = FIXED + resources.length;
  const lastCol = colLetter(totalCols);

  ws.columns = [
    { key: "sno",     width: 6  },
    { key: "desc",    width: 48 },
    { key: "no",      width: 7  },
    { key: "length",  width: 10 },
    { key: "breadth", width: 10 },
    { key: "height",  width: 10 },
    { key: "qty",     width: 12 },
    { key: "unit",    width: 8  },
    ...resources.map(r => ({
      width: Math.max(14, Math.ceil(r.name.length * 1.3) + 2),
      bestFit: true,
    })),
  ];

  // Title
  const titleRow = ws.addRow([`${sheetName.toUpperCase()} — ${boq.project.name.toUpperCase()}`]);
  ws.mergeCells(`A${titleRow.number}:${lastCol}${titleRow.number}`);
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 22;

  const subtitleRow = ws.addRow([
    `Formula: Qty/Unit × (1 + Wastage%) × BOQ Qty (col G)  |  When unit mismatch, BOQ Qty includes conversion factor (e.g. cu ft → Cu.m. × 0.028317)  (DUDBC standard)`
  ]);
  ws.mergeCells(`A${subtitleRow.number}:${lastCol}${subtitleRow.number}`);
  subtitleRow.getCell(1).font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  subtitleRow.getCell(1).alignment = { horizontal: "center" };
  ws.addRow([]);

  // Header rows — two rows: resource names + units
  const nameHdr = ws.addRow([
    "S.No.", "Description", "No.", `Length (${procDrawingUnit})`, `Breadth (${procDrawingUnit})`, `Height (${procDrawingUnit})`, "Quantity", "Unit",
    ...resources.map(r => sanitizeCell(r.name)),
  ]);
  nameHdr.eachCell(c => applyHeaderStyle(c));
  nameHdr.height = 20;

  const unitHdr = ws.addRow([
    "", "", "", "", "", "", "", "",
    ...resources.map(r => `(${r.unit})`),
  ]);
  unitHdr.eachCell((c, col) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    if (col > FIXED) {
      c.font = { size: 8, italic: true, color: { argb: "FFCFDEEE" } };
      c.alignment = { horizontal: "center" };
    }
  });
  unitHdr.height = 14;

  const allDiscSubRows: ExcelJS.Row[] = [];
  let grpSno = 1;

  for (const disc of boq.disciplines) {
    // Discipline band
    const dRow = ws.addRow([sanitizeCell(disc.name.toUpperCase())]);
    ws.mergeCells(`A${dRow.number}:${lastCol}${dRow.number}`);
    dRow.eachCell(c => applyDisciplineStyle(c));
    dRow.height = 16;

    const discGrpSubRows: ExcelJS.Row[] = [];

    for (const grp of disc.groups) {
      const rateItem = grp.rateItemId ? rateMap.get(grp.rateItemId) : undefined;
      const linesForType = rateItem ? rateItem.lines.filter(l => l.lineType === lineType) : [];

      // Group header row — bold band, full width
      const grpHdr = ws.addRow([
        `${grpSno}`,
        sanitizeCell(grp.name),
        "", "", "", "", "", grp.unit,
        ...resources.map(() => ""),
      ]);
      grpHdr.eachCell(c => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
        borderAll(c);
        c.alignment = { vertical: "middle", horizontal: "right" };
      });
      grpHdr.getCell(1).font = { bold: true, size: 10 };
      grpHdr.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      grpHdr.getCell(2).font = { bold: true, size: 10 };
      grpHdr.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
      grpHdr.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
      grpHdr.height = 16;

      // Sub-item rows — multiplier always numeric so qty formula can reference col C
      const subItemRows: ExcelJS.Row[] = [];

      for (const item of grp.items) {
        const itemRow = ws.addRow([
          null,
          sanitizeCell(item.label),
          item.multiplier,             // always numeric
          item.length  ?? null,
          item.breadth ?? null,
          item.height  ?? null,
          item.quantity,
          item.unit,
          ...resources.map(() => null as null),
        ]);

        const rowNum = itemRow.number;

        itemRow.eachCell(c => { borderAll(c); c.alignment = { vertical: "middle", horizontal: "right" }; });
        itemRow.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
        itemRow.getCell(3).numFmt  = "#,##0.###";  // No. — suppress trailing zeros
        itemRow.getCell(4).numFmt  = "#,##0.000";  // Length
        itemRow.getCell(5).numFmt  = "#,##0.000";  // Breadth
        itemRow.getCell(6).numFmt  = "#,##0.000";  // Height
        itemRow.getCell(7).numFmt  = "#,##0.000";  // Quantity — live cell
        itemRow.getCell(8).alignment = { horizontal: "center", vertical: "middle" };

        // Qty formula: C=No., D=Length, E=Breadth, F=Height
        const procItemFml = itemQtyFormula(rowNum, item.length != null, item.breadth != null, item.height != null);
        if (procItemFml) itemRow.getCell(7).value = { formula: procItemFml, result: item.quantity };

        // Resource formulas — reference the Quantity cell (col G) in THIS row
        resources.forEach((res, i) => {
          const colIdx = FIXED + 1 + i;
          const line = linesForType.find(l => l.resource.id === res.id);
          if (!line) return;
          const qpu = parseFloat(line.qtyPerUnit.toFixed(3));
          const wst = parseFloat(line.wastagePercent.toFixed(3));
          const cf = grp.conversionFactor;
          // item.quantity is in the original takeoff unit (e.g. sq ft)
          // qpu is per rate unit (e.g. per Cu.m.)
          // so we must apply the conversion factor before multiplying
          const computed = parseFloat((qpu * (1 + wst / 100) * item.quantity * cf).toFixed(3));
          const formula  = cf !== 1
            ? `=${QTY_COL}${rowNum}*${cf.toFixed(9)}*${qpu}*(1+${wst}/100)`
            : `=${QTY_COL}${rowNum}*${qpu}*(1+${wst}/100)`;
          const cell = itemRow.getCell(colIdx);
          cell.value = { formula, result: computed };
          cell.numFmt = "#,##0.000";
          cell.alignment = { horizontal: "right", vertical: "middle" };
        });

        subItemRows.push(itemRow);
      }

      // Group subtotal qty — SUM of item G cells × groupMultiplier × unit conversion factor
      const procCf = grp.conversionFactor;
      const procGm = grp.groupMultiplier;
      let procGrpQtyValue: number | { formula: string; result: number };
      if (subItemRows.length > 0) {
        const firstRn = subItemRows[0].number;
        const lastRn  = subItemRows[subItemRows.length - 1].number;
        procGrpQtyValue = { formula: groupQtyFormula(firstRn, lastRn, "G", procGm, procCf), result: grp.totalQuantity };
      } else {
        procGrpQtyValue = grp.totalQuantity;
      }

      // Group subtotal row — SUM across sub-item cells
      const subTotRow = ws.addRow([
        null,
        sanitizeCell(grp.name),
        null, null, null, null,
        procGrpQtyValue,
        grp.unit,
        ...resources.map(() => null as null),
      ]);
      ws.mergeCells(`A${subTotRow.number}:B${subTotRow.number}`);
      subTotRow.getCell(1).value = sanitizeCell(grp.name); // A holds value after merge
      subTotRow.eachCell(c => { applyTotalStyle(c); c.alignment = { horizontal: "right", vertical: "middle" }; });
      subTotRow.getCell(1).font = { bold: true, size: 10 };
      subTotRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      subTotRow.getCell(7).numFmt = "#,##0.000";
      subTotRow.getCell(7).font = { bold: true };
      subTotRow.getCell(8).alignment = { horizontal: "center", vertical: "middle" };

      resources.forEach((_, i) => {
        const colIdx = FIXED + 1 + i;
        const refs = subItemRows.map(r => `${colLetter(colIdx)}${r.number}`).join(",");
        const itemSum = subItemRows.reduce((s, r) => {
          const v = r.getCell(colIdx).value;
          if (v === null || v === undefined) return s;
          if (typeof v === "number") return s + v;
          if (typeof v === "object" && "result" in v) {
            const res = (v as { result: unknown }).result;
            return s + (typeof res === "number" ? res : 0);
          }
          return s;
        }, 0);
        // Item resource formulas are per-span (no group multiplier); apply gm at the group subtotal
        const resSumFormula = procGm !== 1 ? `=SUM(${refs})*${procGm}` : `=SUM(${refs})`;
        const resSumVal = itemSum * procGm;
        const cell = subTotRow.getCell(colIdx);
        cell.value = refs ? { formula: resSumFormula, result: resSumVal } : resSumVal;
        cell.numFmt = "#,##0.000";
        cell.font = { bold: true };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      });

      discGrpSubRows.push(subTotRow);
      ws.addRow([]); // blank row between groups
      grpSno++;
    }

    if (discGrpSubRows.length === 0) continue;

    // Discipline subtotal row
    const discSubRow = ws.addRow([
      `${sanitizeCell(disc.name)} — Sub-Total`,
      "", "", "", "", "", "", "",
      ...resources.map(() => null as null),
    ]);
    ws.mergeCells(`A${discSubRow.number}:H${discSubRow.number}`);
    discSubRow.eachCell(c => applyTotalStyle(c));
    discSubRow.getCell(1).font = { bold: true, size: 10 };
    discSubRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    resources.forEach((_, i) => {
      const colIdx = FIXED + 1 + i;
      const refs = discGrpSubRows.map(r => `${colLetter(colIdx)}${r.number}`).join(",");
      const sumVal = discGrpSubRows.reduce((s, r) => {
        const v = r.getCell(colIdx).value;
        if (v === null || v === undefined) return s;
        if (typeof v === "number") return s + v;
        if (typeof v === "object" && "result" in v) {
          const res = (v as { result: unknown }).result;
          return s + (typeof res === "number" ? res : 0);
        }
        return s;
      }, 0);
      const cell = discSubRow.getCell(colIdx);
      cell.value = { formula: `=SUM(${refs})`, result: sumVal };
      cell.numFmt = "#,##0.000";
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right", vertical: "middle" };
    });

    allDiscSubRows.push(discSubRow);
    ws.addRow([]);
  }

  // Grand Total — sums all discipline subtotals per resource column independently
  if (allDiscSubRows.length > 0) {
    const gtRow = ws.addRow([
      "GRAND TOTAL", "", "", "", "", "", "", "",
      ...resources.map(() => null as null),
    ]);
    ws.mergeCells(`A${gtRow.number}:H${gtRow.number}`);
    gtRow.eachCell(c => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      c.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
      c.alignment = { horizontal: "right", vertical: "middle" };
    });
    gtRow.height = 20;

    resources.forEach((_, i) => {
      const colIdx = FIXED + 1 + i;
      const refs = allDiscSubRows.map(r => `${colLetter(colIdx)}${r.number}`).join(",");
      const gtVal = allDiscSubRows.reduce((s, r) => {
        const v = r.getCell(colIdx).value;
        if (v === null || v === undefined) return s;
        if (typeof v === "number") return s + v;
        if (typeof v === "object" && "result" in v) {
          const res = (v as { result: unknown }).result;
          return s + (typeof res === "number" ? res : 0);
        }
        return s;
      }, 0);
      const cell = gtRow.getCell(colIdx);
      cell.value = { formula: `=SUM(${refs})`, result: gtVal };
      cell.numFmt = "#,##0.000";
      cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
      cell.alignment = { horizontal: "right", vertical: "middle" };
    });
  }
}

// Convert 1-based column index to Excel letter (A, B, …, Z, AA, …)
export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
