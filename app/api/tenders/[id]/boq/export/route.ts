import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { apiError, handleApiError } from "@/lib/errors";
import { getOrCreateBidUser } from "@/lib/bid-user";

type Params = { params: Promise<{ id: string }> };

async function resolveContractorAccess(tenderId: number, userId: number) {
  return prisma.tender.findFirst({
    where: {
      id: tenderId,
      status: "PUBLISHED",
      OR: [
        { tender_type: "PUBLIC" },
        { invitations: { some: { contractor_user_id: userId, status: "ACCEPTED" } } },
        { requestsToBid: { some: { contractor_user_id: userId, status: "APPROVED" } } },
      ],
    },
    select: { id: true, title: true, reference_number: true, quantity_visibility: true },
  });
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return apiError("UNAUTHORIZED", "Authentication required.", 401);

    const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
    const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

    const { id } = await params;
    const tenderId = parseInt(id, 10);
    if (isNaN(tenderId)) return apiError("NOT_FOUND", "Tender not found.", 404);

    let tenderTitle: string;
    let tenderRef: string;
    let showQty: boolean;

    if (procurementRoles.includes("CLIENT")) {
      const tender = await prisma.tender.findFirst({
        where: { id: tenderId, client_user_id: bidUser.id },
        select: { id: true, title: true, reference_number: true, quantity_visibility: true },
      });
      if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
      tenderTitle = tender.title;
      tenderRef = tender.reference_number;
      showQty = true;
    } else if (procurementRoles.includes("CONTRACTOR")) {
      const tender = await resolveContractorAccess(tenderId, bidUser.id);
      if (!tender) return apiError("NOT_FOUND", "Tender not found.", 404);
      tenderTitle = tender.title;
      tenderRef = tender.reference_number;
      showQty = tender.quantity_visibility === "VISIBLE";
    } else {
      return apiError("FORBIDDEN", "Access denied.", 403);
    }

    const chapters = await prisma.bidBoqChapter.findMany({
      where: { tender_id: tenderId },
      orderBy: { sort_order: "asc" },
      select: {
        id: true,
        title: true,
        sort_order: true,
        items: {
          orderBy: { sort_order: "asc" },
          select: { id: true, description: true, unit: true, client_quantity: true },
        },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "EstimateNepal";
    wb.created = new Date();

    const ws = wb.addWorksheet("BOQ");

    ws.columns = [
      { header: "#", key: "num", width: 6 },
      { header: "Description", key: "desc", width: 48 },
      { header: "Unit", key: "unit", width: 10 },
      ...(showQty ? [{ header: "Quantity", key: "qty", width: 14 }] : []),
      { header: "Rate (NPR)", key: "rate", width: 14 },
      { header: "Amount (NPR)", key: "amount", width: 16 },
    ];

    // Title rows
    ws.insertRow(1, []);
    ws.insertRow(1, [`${tenderRef} — ${tenderTitle}`]);
    ws.getCell("A1").font = { bold: true, size: 12 };
    ws.insertRow(2, ["BOQ — Rate Schedule (fill in Rate column)"]);
    ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    ws.insertRow(3, []);

    // Re-add header row after inserts
    const headerRow = ws.getRow(4);
    const headerValues = ["#", "Description", "Unit", ...(showQty ? ["Quantity"] : []), "Rate (NPR)", "Amount (NPR)"];
    headerRow.values = headerValues;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    headerRow.alignment = { horizontal: "center" };

    let rowNum = 5;
    let itemCount = 0;

    for (const ch of chapters) {
      const chRow = ws.getRow(rowNum++);
      chRow.values = ["", ch.title];
      chRow.font = { bold: true };
      chRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };

      for (const item of ch.items) {
        itemCount += 1;
        const row = ws.getRow(rowNum++);
        const qty = item.client_quantity !== null ? Number(item.client_quantity) : null;

        if (showQty) {
          row.values = [itemCount, item.description, item.unit, qty ?? "", "", ""];
          // Amount formula: Rate × Qty
          if (qty !== null) {
            const qtyCol = "D";
            const rateCol = "E";
            const amtCol = "F";
            row.getCell(amtCol).value = { formula: `${qtyCol}${rowNum - 1}*${rateCol}${rowNum - 1}` };
          }
        } else {
          row.values = [itemCount, item.description, item.unit, "", ""];
        }
      }

      // Chapter subtotal row
      if (showQty && ch.items.length > 0) {
        const subtotalRow = ws.getRow(rowNum++);
        subtotalRow.values = ["", `${ch.title} — Subtotal`, "", "", "", ""];
        subtotalRow.font = { bold: true };
      }
    }

    // Grand total row
    ws.getRow(rowNum).values = showQty
      ? ["", "GRAND TOTAL", "", "", "", ""]
      : ["", "GRAND TOTAL", "", "", ""];
    ws.getRow(rowNum).font = { bold: true, size: 11 };

    // Rate column highlight (fill yellow to prompt user)
    const rateColLetter = showQty ? "E" : "D";
    for (let r = 5; r < rowNum; r++) {
      const cell = ws.getRow(r).getCell(rateColLetter);
      if (!cell.font?.bold) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEFCE8" } };
      }
    }

    ws.getRow(4).eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF1D4ED8" } },
      };
    });

    const rawBuffer = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(rawBuffer);

    const filename = `${tenderRef.replace(/[^a-zA-Z0-9-]/g, "_")}_BOQ.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
