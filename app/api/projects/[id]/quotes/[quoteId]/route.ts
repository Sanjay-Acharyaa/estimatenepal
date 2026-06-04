import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";
import { withTenantGuard } from "@/lib/auth";

const updateSchema = z.object({
  vendor: z.string().min(1).max(200).trim().optional(),
  amount: z.number().min(0).optional(),
  discipline: z.string().max(100).trim().optional(),
  notes: z.string().max(2000).trim().optional(),
  status: z.enum(["RECEIVED", "UNDER_REVIEW", "ACCEPTED", "REJECTED"]).optional(),
  validUntil: z.string().datetime().nullable().optional(),
});

// PUT /api/projects/[id]/quotes/[quoteId]
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; quoteId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const user = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const quote = await prisma.subcontractorQuote.findUnique({ where: { id: params.quoteId } });
    if (!quote || quote.projectId !== params.id) throw notFound("Quote");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.subcontractorQuote.update({
      where: { id: params.quoteId },
      data: {
        ...parsed.data,
        validUntil: parsed.data.validUntil === null
          ? null
          : parsed.data.validUntil
            ? new Date(parsed.data.validUntil)
            : undefined,
      },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "quote.updated",
      resourceId: params.quoteId,
      meta: parsed.data as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/projects/[id]/quotes/[quoteId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; quoteId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const user = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const quote = await prisma.subcontractorQuote.findUnique({ where: { id: params.quoteId } });
    if (!quote || quote.projectId !== params.id) throw notFound("Quote");

    await prisma.subcontractorQuote.delete({ where: { id: params.quoteId } });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "quote.deleted",
      resourceId: params.quoteId,
      meta: { vendor: quote.vendor } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
