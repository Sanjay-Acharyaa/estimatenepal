import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import ExcelJS from "exceljs";

// POST /api/rates/import
// Accepts: multipart/form-data, field "file" (.xlsx)
//
// Expected format: use the downloaded template from GET /api/rates/template
// Row 1: title, Row 2: instructions, Row 3: headers, Row 4–6: example rows (gray)
// Row 7: separator note
// Data starts at row 8.
//
// Column positions (fixed, matches template):
//   A=1: Code
//   B=2: Description
//   C=3: Unit
//   D=4: Base Rate (NRS)
//   E=5: Fiscal Year
//
// Validates ALL rows before inserting any. Skips duplicate codes (same org).

function cellStr(row: ExcelJS.Row, col: number): string {
  const val = row.getCell(col).value;
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && "richText" in (val as any)) {
    return ((val as any).richText as any[]).map((r: any) => r.text).join("").trim();
  }
  if (typeof val === "object" && "result" in (val as any)) {
    return String((val as any).result ?? "").trim();
  }
  return String(val).trim();
}

// Scan up to 50 rows to find the header row
// Matches any row where col A ≈ "code" AND col B ≈ "description"
function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  let found: number | null = null;
  ws.eachRow((row, rowNum) => {
    if (found || rowNum > 50) return;
    const a = cellStr(row, 1).toLowerCase().replace(/[\s.]/g, "");
    const b = cellStr(row, 2).toLowerCase().replace(/[\s.]/g, "");
    if ((a === "code" || a === "sn" || a === "s.n" || a === "itemcode") &&
        (b === "description" || b === "descriptionofwork" || b === "itemdescription")) {
      found = rowNum;
    }
  });
  return found;
}

function cellNum(row: ExcelJS.Row, col: number): number | null {
  const val = row.getCell(col).value;
  if (val === null || val === undefined) return null;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const batchName = (formData.get("batchName") as string | null)?.trim() || null;
    const batchType = (formData.get("batchType") as string | null) || "CUSTOM";

    if (!file) {
      return NextResponse.json({ error: { message: "No file uploaded." } }, { status: 400 });
    }
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: { message: "Only .xlsx files are accepted. Download the template and fill it in." } }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer as any);

    const ws = wb.worksheets[0];
    if (!ws) {
      return NextResponse.json({ error: { message: "File has no worksheets." } }, { status: 400 });
    }

    // Auto-detect header row (works wherever user pastes the template in their file)
    const headerRowNum = findHeaderRow(ws);

    if (!headerRowNum) {
      return NextResponse.json({
        error: {
          message:
            "Could not find the header row in your file.\n" +
            "The file must have a row with columns: Code | Description | Unit | Base Rate (NRS) | Fiscal Year\n" +
            "Please download the official template and fill it in.",
        }
      }, { status: 400 });
    }

    // Data starts from the row after the header
    // Skip rows that look like the template separator (starts with "↓") or are empty
    const dataStart = headerRowNum + 1;

    // Parse data rows
    interface ParsedRow { code: string; description: string; unit: string; baseRate: number; fiscalYear: string; rowNum: number; }
    const rows: ParsedRow[] = [];
    const errors: string[] = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum < dataStart) return;

      // Skip template separator rows (start with ↓ or similar)
      const firstCell = cellStr(row, 1);
      if (firstCell.startsWith("↓") || firstCell.startsWith("→")) return;

      const code = cellStr(row, 1);
      if (!code) return; // blank row — skip silently

      const description = cellStr(row, 2);
      const unit = cellStr(row, 3);
      const baseRate = cellNum(row, 4);
      const fiscalYear = cellStr(row, 5) || `${new Date().getFullYear()}/${String(new Date().getFullYear() + 1).slice(2)}`;

      if (!description) errors.push(`Row ${rowNum}: Description (column B) is empty.`);
      if (!unit) errors.push(`Row ${rowNum}: Unit (column C) is empty.`);
      if (baseRate === null || baseRate < 0) errors.push(`Row ${rowNum}: Base Rate (column D) is missing or invalid.`);

      if (!errors.length) {
        rows.push({ code, description, unit, baseRate: baseRate!, fiscalYear, rowNum });
      }
    });

    if (errors.length > 0) {
      return NextResponse.json({
        error: {
          message: `${errors.length} validation error${errors.length > 1 ? "s" : ""} found. Fix them and re-upload.`,
          errors: errors.slice(0, 20),
        }
      }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: { message: "No data rows found. Add your rates starting from row 8 of the template." } }, { status: 400 });
    }

    // Deduplicate within the file only (same code can exist in different rate books)
    const seenCodes = new Set<string>();
    const toInsert = rows.filter(r => {
      if (seenCodes.has(r.code)) return false;
      seenCodes.add(r.code);
      return true;
    });
    const skipped = rows.length - toInsert.length;

    // Determine fiscal year from data (use most common value in the file)
    const fyMap = new Map<string, number>();
    for (const r of toInsert) {
      fyMap.set(r.fiscalYear, (fyMap.get(r.fiscalYear) ?? 0) + 1);
    }
    const dominantFY = Array.from(fyMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    // Create a named batch for this import
    const finalBatchName = batchName || `${file.name.replace(/\.(xlsx|xls)$/i, "")} (${new Date().toLocaleDateString("en-NP")})`;

    let batchId: string | null = null;

    if (toInsert.length > 0) {
      try {
        const batch = await prisma.rateBatch.create({
          data: {
            orgId: token.orgId as string,
            name: finalBatchName,
            type: ["CUSTOM", "DISTRICT"].includes(batchType) ? batchType : "CUSTOM",
            itemCount: toInsert.length,
            fiscalYear: dominantFY,
          },
        });
        batchId = batch.id;

        await prisma.rateItem.createMany({
          data: toInsert.map(r => ({
            code: r.code,
            description: r.description,
            unit: r.unit,
            baseRate: r.baseRate,
            fiscalYear: r.fiscalYear,
            source: "CUSTOM" as const,
            orgId: token.orgId as string,
            batchId: batch.id,
          })),
        });
      } catch (dbErr: any) {
        // Clean up batch if item insert failed
        if (batchId) await prisma.rateBatch.delete({ where: { id: batchId } }).catch(() => {});
        const msg = dbErr?.message ?? String(dbErr);
        return NextResponse.json({
          error: {
            message: `Database error during import: ${msg.slice(0, 300)}`,
            hint: "Common causes: description text too long, duplicate codes, or invalid data types.",
          }
        }, { status: 500 });
      }
    }

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_items.bulk_imported",
      meta: { batchId, batchName: finalBatchName, created: toInsert.length, skipped, fileName: file.name } as any,
      ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    return NextResponse.json({
      batchId,
      batchName: finalBatchName,
      created: toInsert.length,
      skipped,
      message:
        `Rate Book "${finalBatchName}" created with ${toInsert.length} rate item${toInsert.length !== 1 ? "s" : ""}.` +
        (skipped > 0 ? ` ${skipped} duplicate row${skipped !== 1 ? "s" : ""} in the file were skipped.` : ""),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
