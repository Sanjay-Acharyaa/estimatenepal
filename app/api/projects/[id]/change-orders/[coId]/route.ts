import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";

const updateSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(5000).optional(),
  reason: z.string().max(2000).optional(),
  amount: z.number().optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).optional(),
  rejectionNote: z.string().max(1000).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string; coId: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);

    const co = await prisma.changeOrder.findFirst({ where: { id: params.coId, projectId: params.id } });
    if (!co) throw notFound("Change Order");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    // Only OWNER/ADMIN can approve/reject
    if ((parsed.data.status === "APPROVED" || parsed.data.status === "REJECTED") && !["OWNER", "ADMIN"].includes(caller.role)) {
      throw forbidden();
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === "APPROVED") { data.approvedBy = token.id; data.approvedAt = new Date(); }
    if (parsed.data.status === "REJECTED") { data.rejectedAt = new Date(); }

    const updated = await prisma.changeOrder.update({ where: { id: params.coId }, data });
    return NextResponse.json(updated);
  } catch (err) { return handleApiError(err); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; coId: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    await prisma.changeOrder.delete({ where: { id: params.coId } });
    return NextResponse.json({ message: "Deleted." });
  } catch (err) { return handleApiError(err); }
}
