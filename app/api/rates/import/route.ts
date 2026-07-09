import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkUploadRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { invalidateRatesCache } from "@/lib/rates";
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

function cellNum(row: ExcelJS.Row, col: number): number | null {
  const val = row.getCell(col).value;
  if (val === null || val === undefined) return null;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  try {
    const _t0 = Date.now();
    const _log = (msg: string) => console.log(`[import] ${msg} +${Date.now()-_t0}ms`);
    _log("start");

    const ip = getClientIp(req);
    const limited = await checkUploadRateLimit(ip);
    _log("rate-limit done");
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    _log("getToken done");
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    _log("tenantGuard done");
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const formData = await req.formData();
    _log("formData done");
    const file = formData.get("file") as File | null;
    const batchName = (formData.get("batchName") as string | null)?.trim() || null;
    const batchType = (formData.get("batchType") as string | null) || "CUSTOM";

    if (!file) {
      return NextResponse.json({ error: { message: "No file uploaded." } }, { status: 400 });
    }
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: { message: "Only .xlsx files are accepted. Download the template and fill it in." } }, { status: 400 });
    }

    const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_IMPORT_SIZE) {
      return NextResponse.json({ error: { message: "File must be under 5 MB." } }, { status: 413 });
    }

    _log(`file: ${file.name} size=${file.size}`);

    const buffer = Buffer.from(await file.arrayBuffer());
    _log("buffer ready");

    interface ParsedRow { code: string; description: string; unit: string; baseRate: number; fiscalYear: string; rowNum: number; }
    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    let headerRowNum: number | null = null;

    // Non-streaming parse — safe for files up to 5 MB on this server (2 GB RAM + 2 GB swap, 1 GB PM2 limit).
    // ExcelJS streaming API has reliability issues in v4.x that caused indefinite hangs in production.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Buffer);
    _log("workbook loaded");

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json({ error: { message: "File has no worksheets." } }, { status: 400 });
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      // Phase 1 — scan first 50 rows to locate the header
      if (headerRowNum === null) {
        if (rowNum <= 50) {
          const a = cellStr(row, 1).toLowerCase().replace(/[\s.]/g, "");
          const b = cellStr(row, 2).toLowerCase().replace(/[\s.]/g, "");
          if (
            (a === "code" || a === "sn" || a === "s.n" || a === "itemcode") &&
            (b === "description" || b === "descriptionofwork" || b === "itemdescription")
          ) {
            headerRowNum = rowNum;
          }
        }
        return;
      }

      // Phase 2 — data rows after header
      const firstCell = cellStr(row, 1);
      if (firstCell.startsWith("↓") || firstCell.startsWith("→")) return;

      const code = cellStr(row, 1);
      if (!code) return;

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
    _log(`eachRow done, rows=${rows.length}, errors=${errors.length}`);

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
        const batch = await prisma.$transaction(async (tx) => {
          const batch = await tx.rateBatch.create({
            data: {
              orgId: token.orgId as string,
              name: finalBatchName,
              type: ["CUSTOM", "DISTRICT"].includes(batchType) ? batchType : "CUSTOM",
              itemCount: toInsert.length,
              fiscalYear: dominantFY,
            },
          });
          await tx.rateItem.createMany({
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
          return batch;
        });
        batchId = batch.id;
        _log("db insert done");
      } catch (dbErr: any) {
        console.error("[rates/import] DB insert failed:", dbErr);
        return NextResponse.json({
          error: {
            message: "Import failed while saving to database.",
            hint: "Common causes: description text too long, duplicate codes, or invalid data types.",
          }
        }, { status: 500 });
      }
    }

    // Invalidate cached rate list so this org's rate picker shows the new batch immediately.
    invalidateRatesCache().catch((e) => console.error("[rates/import] Cache invalidation failed:", e));

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_items.bulk_imported",
      meta: { batchId, batchName: finalBatchName, created: toInsert.length, skipped, fileName: file.name } as any,
      ipAddress: getClientIp(req),
    });

    _log("done");
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
    console.error("[rates/import] unhandled error:", err);
    return handleApiError(err);
  }
}
