import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { RATE_BATCHES_DEFAULT_LIMIT } from "@/lib/cache-constants";

// GET /api/rate-batches — list all rate books for this org (paginated)
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    await withTenantGuard(token.id as string, token.orgId as string);

    const sp = req.nextUrl.searchParams;
    const { page, skip } = parsePagination(sp);
    const limit = Math.min(
      parseInt(sp.get("limit") ?? String(RATE_BATCHES_DEFAULT_LIMIT), 10) || RATE_BATCHES_DEFAULT_LIMIT,
      RATE_BATCHES_DEFAULT_LIMIT,
    );

    const [total, batches] = await Promise.all([
      prisma.rateBatch.count({ where: { orgId: token.orgId as string } }),
      prisma.rateBatch.findMany({
        where: { orgId: token.orgId as string },
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json(
      paginatedResponse(
        batches.map(b => ({
          id: b.id,
          name: b.name,
          type: b.type,
          fiscalYear: b.fiscalYear ?? "",
          itemCount: b._count.items,
          createdAt: b.createdAt,
        })),
        total,
        page,
        limit,
      )
    );
  } catch (err) {
    return handleApiError(err);
  }
}
