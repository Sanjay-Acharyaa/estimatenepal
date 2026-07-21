import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generateBOQ } from "@/lib/boq";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkExportRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import ExcelJS from "exceljs";
import { trackEvent } from "@/lib/analytics";

export const maxDuration = 60;

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]+$/;

// GET /api/projects/[id]/boq/export/procurement
// Generates a Material Procurement Schedule Excel.
// Column layout: A=SN, B=Discipline, C=Description, D=Unit, E=BOQ Qty, F=Wastage%, G=Order Qty, H=Rate, I=Amount
// Formula: Order Qty (G) = =E*(1+F/100)   |   Amount (I) = =G*H
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
      select: { id: true, name: true, orgId: true },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);
    trackEvent("procurement_export", { orgId: project.orgId, userId: token.id as string, meta: { projectId: params.id } });

    const boq = await generateBOQ(params.id);

    // Build group-id → totalQuantity map from the BOQ (lib/boq.ts applies height/breadth/method correctly)
    const boqTotalsMap = new Map<string, number>();
    for (const disc of boq.disciplines) {
      for (const bg of disc.groups) boqTotalsMap.set(bg.id, bg.totalQuantity);
    }

    // Pull wastagePct per group — include rawQuantity + isNegative for quantity-weighted average
    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id, parentId: { not: null } },
      include: {
        items: { select: { wastagePct: true, rawQuantity: true, isNegative: true } },
        rateItem: { select: { description: true, unit: true, baseRate: true } },
        discipline: { select: { name: true } },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Estimate Nepal";

    const ws = wb.addWorksheet("Procurement Schedule");

    // Column layout: A–I
    ws.columns = [
      { key: "sn",         width: 6  },  // A
      { key: "discipline", width: 20 },  // B
      { key: "item",       width: 40 },  // C
      { key: "unit",       width: 10 },  // D  ← unit of the rate item (post-conversion)
      { key: "boqQty",     width: 14 },  // E  ← col referenced by Order Qty formula
      { key: "wastagePct", width: 12 },  // F  ← col referenced by Order Qty formula
      { key: "orderQty",   width: 16 },  // G  ← =E*(1+F/100); col referenced by Amount formula
      { key: "rate",       width: 14 },  // H  ← col referenced by Amount formula
      { key: "amount",     width: 16 },  // I  ← =G*H
    ];

    // Sub-header: formula legend so the reader knows how each column is computed
    const legendRow = ws.addRow([
      `PROCUREMENT SCHEDULE — ${boq.project.name.toUpperCase()}`
    ]);
    ws.mergeCells(`A${legendRow.number}:I${legendRow.number}`);
    legendRow.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
    legendRow.getCell(1).alignment = { horizontal: "center" };
    legendRow.height = 22;

    const formulaNote = ws.addRow([
      "Formula: Order Qty (G) = BOQ Qty (E) × (1 + Wastage% (F) / 100)   |   Order Amount (I) = Order Qty (G) × Rate (H)"
    ]);
    ws.mergeCells(`A${formulaNote.number}:I${formulaNote.number}`);
    formulaNote.getCell(1).font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
    formulaNote.getCell(1).alignment = { horizontal: "center" };

    ws.addRow([]);

    const headerRow = ws.addRow([
      "SN", "Discipline", "Description", "Unit",
      "BOQ Qty", "Wastage %", "Order Qty", "Rate (NRS)", "Order Amount (NRS)",
    ]);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    headerRow.height = 32;

    let sn = 1;
    let totalOrderAmount = 0;
    let firstDataRowNum: number | null = null;
    let lastDataRowNum:  number | null = null;

    for (const grp of groups) {
      // Quantity-weighted wastage — more accurate than arithmetic mean when items have
      // very different sizes (a 50m³ item at 3% and a 0.1m³ item at 10% should give ~3%, not 6.5%).
      // Only positive (non-deduction) items contribute to material wastage.
      let totalPositiveRaw = 0;
      let weightedWastageSum = 0;
      for (const item of grp.items) {
        if (!item.isNegative) {
          const raw = Number(item.rawQuantity);
          totalPositiveRaw += raw;
          weightedWastageSum += raw * Number(item.wastagePct);
        }
      }
      const avgWastage = totalPositiveRaw > 0 ? weightedWastageSum / totalPositiveRaw : 0;

      // totalQuantity from generateBOQ() already applies height/breadth/volume method and unit conversion.
      // The unit shown in column D is grp.rateItem.unit — the post-conversion unit — so E, G are in that unit.
      const boqQtyNum = parseFloat((boqTotalsMap.get(grp.id) ?? 0).toFixed(3));
      const rateNum   = parseFloat(Number(grp.rateItem?.baseRate ?? 0).toFixed(2));

      // Round wastage to 1dp before using it — seed and formula must use the same value
      // so that Excel recalculation produces the same result as the initial display.
      const roundedWastage      = parseFloat(avgWastage.toFixed(1));
      const orderQtyComputed    = boqQtyNum * (1 + roundedWastage / 100);
      const orderAmountComputed = orderQtyComputed * rateNum;
      totalOrderAmount += orderAmountComputed;

      const row = ws.addRow({
        sn:         sn++,
        discipline: grp.discipline?.name ?? "",
        item:       grp.name,
        unit:       grp.rateItem?.unit ?? "",
        boqQty:     boqQtyNum,
        wastagePct: roundedWastage,
        orderQty:   null,   // set to formula below
        rate:       rateNum,
        amount:     null,   // set to formula below
      });

      const rn = row.number;
      if (firstDataRowNum === null) firstDataRowNum = rn;
      lastDataRowNum = rn;

      // Excel formulas — match the system calculation exactly so cells auto-update on edit
      row.getCell("orderQty").value = { formula: `=E${rn}*(1+F${rn}/100)`, result: parseFloat(orderQtyComputed.toFixed(3)) };
      row.getCell("amount").value   = { formula: `=G${rn}*H${rn}`,         result: parseFloat(orderAmountComputed.toFixed(2)) };

      row.getCell("boqQty").numFmt   = "#,##0.000";
      row.getCell("orderQty").numFmt = "#,##0.000";
      row.getCell("rate").numFmt     = "#,##0.00";
      row.getCell("amount").numFmt   = "#,##0.00";
      row.getCell("wastagePct").numFmt = "0.0";

      if (avgWastage > 0) {
        row.getCell("wastagePct").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
        row.getCell("orderQty").fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FFF4" } };
      }

      row.eachCell(cell => {
        cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
        cell.alignment = { vertical: "middle" };
      });
    }

    // Total row — SUM formula so it stays live when user adjusts quantities
    const totalRow = ws.addRow({
      sn: "", discipline: "", item: "TOTAL PROCUREMENT BUDGET",
      unit: "", boqQty: null, wastagePct: null, orderQty: null, rate: null,
      amount: null,
    });
    totalRow.eachCell(cell => {
      cell.font   = { bold: true };
      cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" } };
    });
    if (firstDataRowNum !== null && lastDataRowNum !== null) {
      totalRow.getCell("amount").value = {
        formula: `=SUM(I${firstDataRowNum}:I${lastDataRowNum})`,
        result:  parseFloat(totalOrderAmount.toFixed(2)),
      };
    } else {
      totalRow.getCell("amount").value = parseFloat(totalOrderAmount.toFixed(2));
    }
    totalRow.getCell("amount").numFmt = "#,##0.00";

    // Notes row
    ws.addRow([]);
    const noteRow = ws.addRow(["Note: Order Qty = BOQ Qty × (1 + Wastage%). Wastage% is quantity-weighted across takeoff items. Editing BOQ Qty or Rate cells will automatically update Order Qty and Order Amount."]);
    noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    ws.mergeCells(`A${noteRow.number}:I${noteRow.number}`);

    const result = await withSemaphore("excel", 5, async () => {
      const buffer = await wb.xlsx.writeBuffer();
      const filename = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Procurement.xlsx`;
      return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    });
    return result as NextResponse;
  } catch (err) {
    return handleApiError(err);
  }
}
