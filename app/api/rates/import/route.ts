import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkUploadRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { invalidateRatesCache } from "@/lib/rates";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/cache-constants";
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

function toStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = parseFloat(String(val).replace(/,/g, ""));
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

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json({ error: { message: "File must be under 5 MB." } }, { status: 413 });
    }

    _log(`file: ${file.name} size=${file.size}`);

    const buffer = Buffer.from(await file.arrayBuffer());
    _log("buffer ready");

    const wb = new ExcelJS.Workbook();
    // ExcelJS's .load() signature predates Node's generic Buffer<T>; cast to any
    // so the structurally identical newer Buffer<ArrayBufferLike> is accepted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as any);
    _log("workbook loaded");

    const ws = wb.worksheets[0];
    if (!ws) {
      return NextResponse.json({ error: { message: "File has no worksheets." } }, { status: 400 });
    }

    // Build array-of-arrays matching the shape SheetJS produced:
    // each row is an array of cell values as strings (empty string for missing cells).
    const aoa: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const arr: unknown[] = [];
      const cellCount = typeof row.cellCount === "number" ? row.cellCount : 10;
      for (let c = 1; c <= Math.max(cellCount, 5); c++) {
        const cell = row.getCell(c);
        let val: unknown = "";
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === "object" && "result" in (cell.value as object)) {
            // Formula cell — use the cached result
            val = (cell.value as ExcelJS.CellFormulaValue).result ?? "";
          } else if (typeof cell.value === "object" && "richText" in (cell.value as object)) {
            // Rich text cell — join all runs into a plain string.
            val = (cell.value as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join("") || "";
          } else {
            val = cell.value;
          }
        }
        arr.push(val);
      }
      aoa.push(arr);
    });
    _log(`sheet parsed, aoa=${aoa.length}`);

    interface ParsedRow { code: string; description: string; unit: string; baseRate: number; fiscalYear: string; rowNum: number; }
    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    let headerRowNum: number | null = null;

    for (let i = 0; i < aoa.length; i++) {
      const rowArr = aoa[i];
      const rowNum = i + 1;

      // Skip completely empty rows
      if (!rowArr.some(c => toStr(c) !== "")) continue;

      // Phase 1 — scan first 50 rows to locate the header
      if (headerRowNum === null) {
        if (rowNum <= 50) {
          const a = toStr(rowArr[0]).toLowerCase().replace(/[\s.]/g, "");
          const b = toStr(rowArr[1]).toLowerCase().replace(/[\s.]/g, "");
          if (
            (a === "code" || a === "sn" || a === "s.n" || a === "itemcode") &&
            (b === "description" || b === "descriptionofwork" || b === "itemdescription")
          ) {
            headerRowNum = rowNum;
          }
        }
        continue;
      }

      // Phase 2 — data rows after header
      const firstCell = toStr(rowArr[0]);
      if (firstCell.startsWith("↓") || firstCell.startsWith("→")) continue;

      const code = toStr(rowArr[0]);
      if (!code) continue;

      const description = toStr(rowArr[1]);
      const unit = toStr(rowArr[2]);
      const baseRate = toNum(rowArr[3]);
      const fiscalYear = toStr(rowArr[4]) || `${new Date().getFullYear()}/${String(new Date().getFullYear() + 1).slice(2)}`;

      // Skip section headers, subtotal rows, etc. that have no unit or rate — these are not rate items.
      if (!description || !unit || baseRate === null) continue;

      if (baseRate < 0) {
        errors.push(`Row ${rowNum}: Base Rate cannot be negative (${baseRate}).`);
        continue;
      }

      rows.push({ code, description, unit, baseRate, fiscalYear, rowNum });
    }
    _log(`rows parsed, rows=${rows.length}, errors=${errors.length}`);

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

    // Deduplicate within the file
    const seenCodes = new Set<string>();
    const deduped = rows.filter(r => {
      if (seenCodes.has(r.code)) return false;
      seenCodes.add(r.code);
      return true;
    });
    const fileSkipped = rows.length - deduped.length;

    // Deduplicate against codes that already exist in this org's rate catalog
    const existingItems = deduped.length > 0
      ? await prisma.rateItem.findMany({
          where: { orgId: token.orgId as string, code: { in: deduped.map(r => r.code) } },
          select: { code: true },
        })
      : [];
    const existingCodeSet = new Set(existingItems.map(r => r.code));
    const toInsert = deduped.filter(r => !existingCodeSet.has(r.code));
    const dbSkipped = deduped.length - toInsert.length;
    const skipped = fileSkipped + dbSkipped;

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
              type: (["CUSTOM", "DISTRICT"].includes(batchType) ? batchType : "CUSTOM") as "CUSTOM" | "DISTRICT",
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
      } catch (dbErr: unknown) {
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
    invalidateRatesCache(token.orgId as string).catch((e) => console.error("[rates/import] Cache invalidation failed:", e));

    appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_items.bulk_imported",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        (fileSkipped > 0 ? ` ${fileSkipped} in-file duplicate${fileSkipped !== 1 ? "s" : ""} skipped.` : "") +
        (dbSkipped > 0 ? ` ${dbSkipped} code${dbSkipped !== 1 ? "s" : ""} already exist in this org's rate catalog and were skipped.` : ""),
    });
  } catch (err) {
    console.error("[rates/import] unhandled error:", err);
    return handleApiError(err);
  }
}
