import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generateBOQ } from "@/lib/boq";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withSemaphore } from "@/lib/semaphore";
import ExcelJS from "exceljs";
import { trackEvent } from "@/lib/analytics";

// GET /api/projects/[id]/boq/export/procurement
// Generates a Material Procurement Schedule Excel.
// For each BOQ group: quantity × (1 + wastagePct/100) = material to order.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

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

    // Pull wastagePct from TakeoffItems grouped by their group
    // Also fetch isNegative, rawQuantity, multiplier, additionalParams for correct BOQ qty (BUG 10 & 11)
    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id, parentId: { not: null } },
      include: {
        items: { select: { wastagePct: true, quantity: true, isNegative: true, rawQuantity: true, shapeType: true } },
        rateItem: { select: { description: true, unit: true, baseRate: true } },
        discipline: { select: { name: true } },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Estimate Nepal";

    const ws = wb.addWorksheet("Procurement Schedule");

    // Header row
    ws.columns = [
      { key: "sn", width: 6 },
      { key: "discipline", width: 20 },
      { key: "item", width: 40 },
      { key: "unit", width: 10 },
      { key: "boqQty", width: 14 },
      { key: "wastagePct", width: 12 },
      { key: "orderQty", width: 16 },
      { key: "rate", width: 14 },
      { key: "amount", width: 16 },
    ];

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

    for (const grp of groups) {
      const avgWastage = grp.items.length > 0
        ? grp.items.reduce((s, i) => s + i.wastagePct, 0) / grp.items.length
        : 0;

      // Compute BOQ quantity the same way lib/boq.ts does:
      // sum signed rawQuantity (respecting isNegative), then apply group multiplier (BUG 10 & 11)
      const ap = grp.additionalParams as Record<string, unknown> | null;
      const type = grp.type as string;
      let rawSum = 0;
      if (type === "VOLUME") {
        const method = (ap?.volumeMethod as string) ?? "area_x_h";
        for (const i of grp.items) {
          const isLength = i.shapeType === "POLYLINE" || i.shapeType === "ARC" || !i.shapeType;
          const isArea = i.shapeType === "RECTANGLE" || i.shapeType === "CIRCLE" || i.shapeType === "POLYGON";
          if ((method === "lbh" && isLength) || (method !== "lbh" && isArea)) {
            rawSum += i.isNegative ? -i.rawQuantity : i.rawQuantity;
          }
        }
      } else {
        for (const i of grp.items) {
          rawSum += i.isNegative ? -i.rawQuantity : i.rawQuantity;
        }
      }
      // Apply group-level multiplier
      const boqQty = rawSum * grp.multiplier;
      const orderQty = boqQty * (1 + avgWastage / 100);
      const rate = grp.rateItem?.baseRate ?? 0;
      const orderAmount = orderQty * rate;
      totalOrderAmount += orderAmount;

      const row = ws.addRow({
        sn: sn++,
        discipline: grp.discipline?.name ?? "",
        item: grp.name,
        unit: grp.rateItem?.unit ?? "",
        boqQty: parseFloat(boqQty.toFixed(3)),
        wastagePct: parseFloat(avgWastage.toFixed(1)),
        orderQty: parseFloat(orderQty.toFixed(3)),
        rate: parseFloat(rate.toFixed(2)),
        amount: parseFloat(orderAmount.toFixed(2)),
      });

      row.getCell("boqQty").numFmt = "#,##0.000";
      row.getCell("orderQty").numFmt = "#,##0.000";
      row.getCell("rate").numFmt = "#,##0.00";
      row.getCell("amount").numFmt = "#,##0.00";
      row.getCell("wastagePct").numFmt = "0.0";

      if (avgWastage > 0) {
        row.getCell("wastagePct").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
        row.getCell("orderQty").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FFF4" } };
      }

      row.eachCell(cell => {
        cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
        cell.alignment = { vertical: "middle" };
      });
    }

    // Total row
    const totalRow = ws.addRow({
      sn: "", discipline: "", item: "TOTAL PROCUREMENT BUDGET",
      unit: "", boqQty: "", wastagePct: "", orderQty: "", rate: "",
      amount: parseFloat(totalOrderAmount.toFixed(2)),
    });
    totalRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      cell.border = { top: { style: "medium" }, bottom: { style: "medium" } };
    });
    totalRow.getCell("amount").numFmt = "#,##0.00";

    // Notes row
    ws.addRow([]);
    const noteRow = ws.addRow(["Note: Order Qty = BOQ Qty × (1 + Wastage%). Wastage % is set per takeoff item and represents material over-order for cutting, breakage, and installation losses."]);
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
