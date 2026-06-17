import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { checkUploadRateLimit, getClientIp } from "@/lib/security";
import { invalidateDudbcCaches } from "@/lib/rates";
import ExcelJS from "exceljs";

// POST /api/admin/rates/import
// Super admin only. Accepts multipart/form-data with field "file" (.xlsx / .xls).
// Validates ALL rows before writing any (all-or-nothing).
// Returns { imported, skipped, errors } on success, or { errors } on validation failure.
//
// Expected columns (detected by header name, order-independent):
//   Code | Description | Unit | Base Rate | Fiscal Year

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  const user = await prisma.user.findUnique({ where: { id: token.id as string }, select: { isSuperAdmin: true } });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

function cellStr(row: ExcelJS.Row, col: number): string {
  const val = row.getCell(col).value;
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && "richText" in (val as any))
    return ((val as any).richText as any[]).map((r: any) => r.text).join("").trim();
  if (typeof val === "object" && "result" in (val as any))
    return String((val as any).result ?? "").trim();
  return String(val).trim();
}

function cellNum(row: ExcelJS.Row, col: number): number | null {
  const val = row.getCell(col).value;
  if (val === null || val === undefined) return null;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s._\-/]/g, "");
}

type ColMap = { code: number; description: number; unit: number; baseRate: number; fiscalYear: number | null };

function findHeaderRow(ws: ExcelJS.Worksheet): { rowNum: number; cols: ColMap } | null {
  let found: { rowNum: number; cols: ColMap } | null = null;

  ws.eachRow((row, rowNum) => {
    if (found || rowNum > 50) return;

    const cells: Record<string, number> = {};
    row.eachCell((cell, colNum) => {
      const key = normalize(String(cell.value ?? ""));
      if (key) cells[key] = colNum;
    });

    const codeCol = cells["code"] ?? cells["itemcode"] ?? cells["sn"];
    const descCol = cells["description"] ?? cells["descriptionofwork"] ?? cells["desc"];
    const unitCol = cells["unit"];
    const rateCol = cells["baserate"] ?? cells["rate"] ?? cells["unitrate"];
    const fyCol = cells["fiscalyear"] ?? cells["fy"] ?? cells["year"];

    if (codeCol && descCol) {
      found = {
        rowNum,
        cols: {
          code: codeCol,
          description: descCol,
          unit: unitCol ?? 3,
          baseRate: rateCol ?? 4,
          fiscalYear: fyCol ?? null,
        },
      };
    }
  });

  return found;
}

type ParsedRow = {
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  fiscalYear: string;
};

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkUploadRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fiscalYear = (formData.get("fiscalYear") as string | null)?.trim() ?? "";

    if (!file) return apiError("VALIDATION_ERROR", "No file uploaded.", 400);
    if (!file.name.match(/\.(xlsx|xls)$/i))
      return apiError("VALIDATION_ERROR", "Only .xlsx files are accepted.", 400);
    if (file.size > MAX_FILE_BYTES)
      return apiError("VALIDATION_ERROR", "File must be under 10 MB.", 400);
    if (!fiscalYear)
      return apiError("VALIDATION_ERROR", "fiscalYear is required.", 400);

    const arrayBuf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuf as any);
    const ws = wb.worksheets[0];
    if (!ws) return apiError("VALIDATION_ERROR", "Workbook has no sheets.", 400);

    const header = findHeaderRow(ws);
    if (!header) return apiError("VALIDATION_ERROR", "Could not find header row (need Code + Description columns).", 400);

    const { rowNum: headerRow, cols } = header;
    const rows: ParsedRow[] = [];
    const errors: string[] = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum <= headerRow) return;
      const code = cellStr(row, cols.code);
      const description = cellStr(row, cols.description);
      const unit = cellStr(row, cols.unit);
      const baseRate = cellNum(row, cols.baseRate);
      const fy = (cols.fiscalYear ? cellStr(row, cols.fiscalYear) : "") || fiscalYear;

      if (!code && !description) return; // blank row

      if (!code) { errors.push(`Row ${rowNum}: Code is required.`); return; }
      if (!description) { errors.push(`Row ${rowNum}: Description is required.`); return; }
      if (!unit) { errors.push(`Row ${rowNum}: Unit is required.`); return; }
      if (baseRate === null || baseRate < 0) { errors.push(`Row ${rowNum}: Base Rate must be ≥ 0.`); return; }

      rows.push({ code, description, unit, baseRate, fiscalYear: fy });
    });

    if (errors.length > 0)
      return NextResponse.json({ success: false, errors }, { status: 422 });

    if (rows.length === 0)
      return apiError("VALIDATION_ERROR", "File contains no data rows.", 400);

    // Detect intra-batch duplicates (same code + FY appearing twice in the file)
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.code}::${row.fiscalYear}`;
      if (seen.has(key)) {
        errors.push(`Duplicate code "${row.code}" for FY ${row.fiscalYear} within the file.`);
      }
      seen.add(key);
    }
    if (errors.length > 0)
      return NextResponse.json({ success: false, errors }, { status: 422 });

    // Build per-FY existing code sets to correctly detect cross-FY duplicates
    const uniqueFYs = Array.from(new Set(rows.map(r => r.fiscalYear)));
    const existingByFY = new Map<string, Set<string>>();
    await Promise.all(
      uniqueFYs.map(async fy => {
        const existing = await prisma.rateItem.findMany({
          where: { source: "DUDBC", fiscalYear: fy },
          select: { code: true },
        });
        existingByFY.set(fy, new Set(existing.map(r => r.code)));
      })
    );

    const toInsert = rows.filter(r => !existingByFY.get(r.fiscalYear)?.has(r.code));
    const skipped = rows.length - toInsert.length;

    if (toInsert.length > 0) {
      await prisma.rateItem.createMany({
        data: toInsert.map(r => ({ ...r, source: "DUDBC" as const, isPublished: false })),
      });
    }

    invalidateDudbcCaches().catch((e) => console.error("[admin/rates/import] Cache invalidation failed:", e));

    await appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rates.imported",
      resourceId: fiscalYear,
      meta: { fiscalYear, imported: toInsert.length, skipped } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, imported: toInsert.length, skipped, errors: [] });
  } catch (err) {
    return handleApiError(err);
  }
}
