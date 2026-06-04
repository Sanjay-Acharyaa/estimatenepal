import ExcelJS from "exceljs";
import type { BOQDocument, BOQGroup } from "./boq";

const NRS = (n: number) =>
  n.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

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

export async function buildBOQExcel(boq: BOQDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "NepaliEstimate";
  wb.created = new Date();

  // ── Summary Sheet ──────────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary BOQ");
  summary.columns = [
    { key: "sno", width: 8 },
    { key: "desc", width: 42 },
    { key: "unit", width: 10 },
    { key: "qty", width: 14 },
    { key: "rate", width: 14 },
    { key: "amount", width: 16 },
  ];

  // Project header
  const titleRow = summary.addRow([`BILL OF QUANTITIES — ${boq.project.name.toUpperCase()}`]);
  summary.mergeCells(`A${titleRow.number}:F${titleRow.number}`);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 24;

  if (boq.project.clientCompany || boq.project.clientName) {
    const clientRow = summary.addRow([
      `Client: ${[boq.project.clientCompany, boq.project.clientName].filter(Boolean).join(" — ")}`,
    ]);
    summary.mergeCells(`A${clientRow.number}:F${clientRow.number}`);
    clientRow.getCell(1).font = { size: 10, italic: true };
    clientRow.getCell(1).alignment = { horizontal: "center" };
  }

  const metaRow = summary.addRow([
    `District: ${boq.project.district ?? "—"}  |  Date: ${new Date(boq.generatedAt).toLocaleDateString("en-NP")}`,
  ]);
  summary.mergeCells(`A${metaRow.number}:F${metaRow.number}`);
  metaRow.getCell(1).font = { size: 9, color: { argb: "FF6B7280" } };
  metaRow.getCell(1).alignment = { horizontal: "center" };

  summary.addRow([]);

  // Column headers
  const hdr = summary.addRow(["S.No.", "Description of Work", "Unit", "Quantity", "Rate (NRS)", "Amount (NRS)"]);
  hdr.eachCell((c) => applyHeaderStyle(c));
  hdr.height = 20;

  let sno = 1;

  for (const disc of boq.disciplines) {
    // Discipline row
    const dRow = summary.addRow([disc.name.toUpperCase()]);
    summary.mergeCells(`A${dRow.number}:F${dRow.number}`);
    dRow.eachCell((c) => applyDisciplineStyle(c));
    dRow.height = 18;

    let dSno = 1;
    for (const grp of disc.groups) {
      const grpLabel = `${sno}.${dSno}  ${grp.name}`;
      const gRow = summary.addRow([`${sno}.${dSno}`, grp.name, grp.unit, +qty(grp.totalQuantity), grp.rate, grp.amount]);
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
      const ghRow = ws.addRow([`${lineNo}`, grp.name]);
      ws.mergeCells(`B${ghRow.number}:J${ghRow.number}`);
      ghRow.eachCell((c) => applyGroupStyle(c));
      if (grp.preamble) {
        const pRow = ws.addRow(["", grp.preamble]);
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
          +qty(item.quantity),
          item.unit,
          null,
          null,
        ]);
        iRow.eachCell((c) => { c.alignment = { horizontal: "right", vertical: "middle" }; borderAll(c); });
        iRow.getCell(2).alignment = { horizontal: "left" };
        iRow.getCell(7).numFmt = '#,##0.000';
      }

      // Group total row
      const totalQty = +qty(grp.totalQuantity);
      const tRow = ws.addRow([
        "", `Total — ${grp.name}`, "", "", "", "",
        totalQty, grp.unit, grp.rate, grp.amount,
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
    const stRow = ws.addRow(["", `${disc.name} — Sub-Total`, "", "", "", "", "", "", "", disc.subtotal]);
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
  wb.creator = "NepaliEstimate";
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
    const dRow = ws.addRow([disc.name.toUpperCase()]);
    ws.mergeCells(`A${dRow.number}:K${dRow.number}`);
    dRow.eachCell((c) => applyDisciplineStyle(c));

    for (const grp of disc.groups) {
      const ghRow = ws.addRow([`${lineNo}`, grp.name]);
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
          +qty(item.quantity),
          item.unit,
          item.siteLocation ?? "",
          item.measuredDate ? new Date(item.measuredDate).toLocaleDateString("en-NP") : "",
          item.notes ?? "",
        ]);
        iRow.eachCell((c) => {
          c.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
          borderAll(c);
        });
        iRow.getCell(2).alignment = { horizontal: "left", wrapText: true };
        iRow.getCell(9).alignment = { horizontal: "left" };
        iRow.getCell(11).alignment = { horizontal: "left", wrapText: true };
        iRow.getCell(7).numFmt = '#,##0.000';
      }

      const tRow = ws.addRow([
        "", `Total — ${grp.name}`, "", "", "", "", +qty(grp.totalQuantity), grp.unit,
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
        <td class="desc indent">${item.label}</td>
        <td class="num">${item.multiplier !== 1 ? item.multiplier : ""}</td>
        <td class="num">${item.length != null ? qty(item.length) : ""}</td>
        <td class="num">${item.breadth != null ? qty(item.breadth) : ""}</td>
        <td class="num">${item.height != null ? qty(item.height) : ""}</td>
        <td class="num">${qty(item.quantity)}</td>
        <td>${item.unit}</td>
        <td></td>
        <td></td>
      </tr>`
      )
      .join("");

    return `
    <tr class="group-row">
      <td>${sno}</td>
      <td class="desc"><strong>${grp.name}</strong>${grp.preamble ? `<div class="preamble">${grp.preamble}</div>` : ""}</td>
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
      <td colspan="10">${disc.name.toUpperCase()}</td>
    </tr>
    ${groups}
    <tr class="subtotal-row">
      <td colspan="9" class="right"><strong>${disc.name} Sub-Total</strong></td>
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
    ${boq.project.name}
    ${boq.project.clientCompany ? ` — ${boq.project.clientCompany}` : ""}
    ${boq.project.district ? ` | ${boq.project.district}` : ""}
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
    await page.setContent(buildBOQHtml(boq), { waitUntil: "load" });
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
