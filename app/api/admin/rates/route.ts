export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { invalidateDudbcCaches } from "@/lib/rates";

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  const user = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

const createSchema = z.object({
  code: z.string().min(1).max(50).trim(),
  description: z.string().min(1).trim(),
  unit: z.string().min(1).max(50).trim(),
  baseRate: z.number().min(0),
  fiscalYear: z.string().min(4).max(10).trim(),
});

// GET /api/admin/rates?page=&limit=&fiscalYear=&search=
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const sp = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(sp);
    const fiscalYear = sp.get("fiscalYear") ?? "";
    const search = (sp.get("search") ?? "").slice(0, 200);

    const where = {
      source: "DUDBC" as const,
      ...(fiscalYear ? { fiscalYear } : {}),
      ...(search ? {
        OR: [
          { code: { contains: search } },
          { description: { contains: search } },
        ],
      } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.rateItem.count({ where }),
      prisma.rateItem.findMany({
        where,
        orderBy: [{ fiscalYear: "desc" }, { code: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    // Distinct fiscal years for filter dropdown
    const fiscalYears = await prisma.rateItem.findMany({
      where: { source: "DUDBC" },
      select: { fiscalYear: true },
      distinct: ["fiscalYear"],
      orderBy: { fiscalYear: "desc" },
    });

    return NextResponse.json({
      ...paginatedResponse(items, total, page, limit),
      fiscalYears: fiscalYears.map(f => f.fiscalYear),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/rates — create a single DUDBC rate item
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    // Block if same code+fiscalYear already published
    const existing = await prisma.rateItem.findFirst({
      where: { source: "DUDBC", code: parsed.data.code, fiscalYear: parsed.data.fiscalYear },
    });
    if (existing) return apiError("CONFLICT", `Rate code ${parsed.data.code} already exists for FY ${parsed.data.fiscalYear}.`, 409);

    const rate = await prisma.rateItem.create({
      data: { ...parsed.data, source: "DUDBC", isPublished: false },
    });

    appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rate.created",
      resourceId: rate.id,
      meta: { code: rate.code, fiscalYear: rate.fiscalYear } as any,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/admin/rates?fiscalYear=X — super admin only, deletes entire fiscal year
// Super admin only. Deletes ALL DUDBC rates for the given fiscal year (published or not),
// including district rates, rate analyses, and BOQ overrides linked to them.
export async function DELETE(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const fiscalYear = req.nextUrl.searchParams.get("fiscalYear")?.trim() ?? "";
    if (!fiscalYear) return apiError("VALIDATION_ERROR", "fiscalYear is required.", 400);

    const rateItems = await prisma.rateItem.findMany({
      where: { source: "DUDBC", fiscalYear },
      select: { id: true },
    });
    if (rateItems.length === 0)
      return apiError("NOT_FOUND", `No DUDBC rates found for FY ${fiscalYear}.`, 404);

    const ids = rateItems.map(r => r.id);

    await prisma.$transaction([
      prisma.districtRate.deleteMany({ where: { rateItemId: { in: ids } } }),
      prisma.rateAnalysis.deleteMany({ where: { rateItemId: { in: ids } } }),
      prisma.bOQOverride.deleteMany({ where: { rateItemId: { in: ids } } }),
      prisma.rateItem.deleteMany({ where: { id: { in: ids } } }),
    ]);

    appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rates.fiscal_year_deleted",
      resourceId: fiscalYear,
      meta: { fiscalYear, count: ids.length } as any,
      ipAddress: getClientIp(req),
    });

    invalidateDudbcCaches().catch((e) => console.error("[admin/rates DELETE] Cache invalidation failed:", e));

    return NextResponse.json({ deleted: ids.length, fiscalYear });
  } catch (err) {
    return handleApiError(err);
  }
}
