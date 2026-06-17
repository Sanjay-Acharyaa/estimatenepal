import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const updateSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  panNumber: z.string().max(20).trim().optional(),
  logoUrl: z.string().url().max(500).optional().or(z.literal("")),
  address: z.string().max(500).trim().optional(),
  phone: z.string().max(30).trim().optional(),
});

// GET /api/orgs/me
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    if (!orgId) return apiError("NOT_FOUND", "No organisation found.", 404);

    const org = await prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw notFound("Organisation");

    return NextResponse.json(org);
  } catch (err) {
    return handleApiError(err);
  }
}

// PUT /api/orgs/me — OWNER only
export async function PUT(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    if (!orgId) return apiError("NOT_FOUND", "No organisation found.", 404);
    const member = await withTenantGuard(token.id as string, orgId);
    if (member.role !== "OWNER") throw forbidden();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.org.update({
      where: { id: orgId },
      data: {
        ...parsed.data,
        logoUrl: parsed.data.logoUrl === "" ? null : parsed.data.logoUrl,
      },
    });

    await appendAuditLog({
      orgId: orgId,
      userId: token.id as string,
      event: "org.updated",
      resourceId: orgId,
      meta: parsed.data as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
