export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { invalidateDudbcCaches } from "@/lib/rates";

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  const user = await prisma.user.findUnique({ where: { id: token.id as string }, select: { isSuperAdmin: true } });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

const schema = z.object({
  fiscalYear: z.string().min(4).max(10).trim(),
});

// POST /api/admin/rates/publish
// Marks all DUDBC rates for the given fiscal year as isPublished=true (irreversible).
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const { fiscalYear } = parsed.data;

    // Verify there are unpublished rates to publish
    const count = await prisma.rateItem.count({
      where: { source: "DUDBC", fiscalYear, isPublished: false },
    });
    if (count === 0) {
      return apiError("CONFLICT", `No unpublished DUDBC rates found for FY ${fiscalYear}.`, 409);
    }

    const result = await prisma.rateItem.updateMany({
      where: { source: "DUDBC", fiscalYear, isPublished: false },
      data: { isPublished: true },
    });

    await appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rates.published",
      resourceId: fiscalYear,
      meta: { fiscalYear, count: result.count } as any,
      ipAddress: getClientIp(req),
    });

    // Invalidate the FY and rates caches so all replicas see the new published rates immediately.
    invalidateDudbcCaches().catch((e) => console.error("[publish] Cache invalidation failed:", e));

    return NextResponse.json({ fiscalYear, published: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
