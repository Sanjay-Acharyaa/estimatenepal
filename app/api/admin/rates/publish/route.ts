import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";

function requireSuperAdmin(token: { isSuperAdmin?: unknown } | null) {
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
}

const schema = z.object({
  fiscalYear: z.string().min(4).max(10).trim(),
});

// POST /api/admin/rates/publish
// Marks all DUDBC rates for the given fiscal year as isPublished=true (irreversible).
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    requireSuperAdmin(token);

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
      ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    return NextResponse.json({ fiscalYear, published: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
