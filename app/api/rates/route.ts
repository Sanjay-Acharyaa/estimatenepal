import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";

const createSchema = z.object({
  code: z.string().min(1).max(50).trim(),
  description: z.string().min(1).trim(),
  unit: z.string().min(1).max(50).trim(),
  baseRate: z.number().min(0),
  fiscalYear: z.string().min(4).max(10).trim(),
});

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const sp = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(sp);
    const search = sp.get("search") ?? "";
    const source = sp.get("source") ?? "";
    const batchId = sp.get("batchId") ?? "";

    const where = {
      AND: [
        // Org sees its own CUSTOM rates + global DUDBC rates
        { OR: [{ orgId: token.orgId as string }, { orgId: null }] },
        ...(source ? [{ source: source as any }] : []),
        ...(batchId === "none" ? [{ batchId: null }] : batchId ? [{ batchId }] : []),
        ...(search
          ? [{
              OR: [
                { code: { contains: search } },
                { description: { contains: search } },
              ],
            }]
          : []),
      ],
    };

    // Natural sort: numeric codes sort as numbers (1,2,3,10,100) not strings (1,10,100,2)
    // Prisma can't do LENGTH()-based ordering natively so we sort after fetch.
    // Rate catalogs are small (< 5000 items) so in-memory sort is fine.
    const [allData, total] = await Promise.all([
      prisma.rateItem.findMany({ where }),
      prisma.rateItem.count({ where }),
    ]);

    allData.sort((a, b) => {
      // Group by source first (DUDBC before CUSTOM alphabetically)
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      // Natural sort on code: if both fully numeric, compare as numbers
      const nA = Number(a.code);
      const nB = Number(b.code);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      // Mixed: numeric codes before alphanumeric
      if (!isNaN(nA)) return -1;
      if (!isNaN(nB)) return 1;
      // Both alphanumeric: sort by length then value (E1.1, E1.2, E1.10...)
      if (a.code.length !== b.code.length) return a.code.length - b.code.length;
      return a.code.localeCompare(b.code);
    });

    const data = allData.slice(skip, skip + limit);

    return NextResponse.json(paginatedResponse(data, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    // Only OWNER/ADMIN can create rates
    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const rate = await prisma.rateItem.create({
      data: {
        ...parsed.data,
        source: "CUSTOM",
        orgId: token.orgId as string,
      },
    });

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_item.created",
      resourceId: rate.id,
      meta: { code: parsed.data.code, description: parsed.data.description } as any,
      ipAddress: ip,
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
