import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { handleApiError, unauthorized } from "@/lib/errors";
import ExcelJS from "exceljs";

// GET /api/rates/template — returns a pre-formatted .xlsx import template
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const wb = new ExcelJS.Workbook();
    wb.creator = "NepaliEstimate";
    const ws = wb.addWorksheet("Rate Import Template");

    // Column widths
    ws.columns = [
      { key: "code",        width: 14 },
      { key: "description", width: 60 },
      { key: "unit",        width: 14 },
      { key: "baseRate",    width: 18 },
      { key: "fiscalYear",  width: 14 },
    ];

    // Row 1 — Title
    const titleRow = ws.addRow(["NepaliEstimate — Rate Item Import Template"]);
    ws.mergeCells(`A1:E1`);
    titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
    titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    titleRow.height = 24;

    // Row 2 — Instructions
    const instrRow = ws.addRow([
      "Instructions: Fill rows below. Do NOT rename or delete the header row (row 3). " +
      "Code must be unique per row. Base Rate must be a number (e.g. 1250.50). " +
      "Fiscal Year format: 2081/82 or 2026/27.",
    ]);
    ws.mergeCells(`A2:E2`);
    instrRow.getCell(1).font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
    instrRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    instrRow.getCell(1).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    instrRow.height = 32;

    // Row 3 — Headers (EXACT — import reads these column positions)
    const hdrRow = ws.addRow(["Code", "Description", "Unit", "Base Rate (NRS)", "Fiscal Year"]);
    hdrRow.height = 20;
    hdrRow.eachCell(cell => {
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    });

    // Rows 4–6 — Example rows (gray italic, shows expected format)
    const examples = [
      ["E1.1", "Excavation in ordinary soil including disposal up to 50m lead, 1.5m lift", "Cu.m", 280, "2081/82"],
      ["B2.3", "Providing & laying 1st class brick masonry in cement mortar (1:4) in superstructure", "Cu.m", 4500, "2081/82"],
      ["P3.5", "12mm thick cement plaster (1:3) on walls including curing", "Sq.m", 320, "2081/82"],
    ];

    for (const ex of examples) {
      const exRow = ws.addRow(ex);
      exRow.height = 18;
      exRow.eachCell((cell, col) => {
        cell.font = { size: 9, italic: true, color: { argb: "FF9CA3AF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
        cell.border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
        if (col === 4) {
          cell.numFmt = "#,##0.00";
          cell.alignment = { horizontal: "right" };
        }
        if (col === 1 || col === 3 || col === 5) cell.alignment = { horizontal: "center" };
      });
    }

    // Row 7 — separator with note
    const noteRow = ws.addRow(["↓ Add your data from this row onwards. Delete example rows above if needed."]);
    ws.mergeCells(`A7:E7`);
    noteRow.getCell(1).font = { size: 9, color: { argb: "FF3B82F6" }, bold: true };
    noteRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    noteRow.getCell(1).alignment = { horizontal: "center" };

    // Freeze header rows so they stay visible while scrolling
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 7, activeCell: "A8" }];

    // Data validation on Unit column (col C) — dropdown of common Nepal units
    ws.getColumn("C").eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber <= 3) return;
    });
    // Add unit dropdown for rows 8–200
    for (let r = 8; r <= 200; r++) {
      ws.getCell(`C${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Cu.m,Sq.m,Rmt,Cu.ft,Sq.ft,Rft,Kg,MT,No.,LS,Bag,Litre,Day,Set,Pair,Point"'],
        showErrorMessage: false,
      };
    }

    const buf = await wb.xlsx.writeBuffer();

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="NepaliEstimate_Rate_Import_Template.xlsx"',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
