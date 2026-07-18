import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";

const updateSchema = z.object({
  wastePct: z.number().min(0).max(100).optional(),
  markupPct: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).trim().nullable().optional(),
});

type RouteContext = { params: { id: string; groupId: string } };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const orgId = token.orgId as string;
    const user = await withTenantGuard(token.id as string, orgId);
    if (!["OWNER", "ADMIN", "MEMBER"].includes(user.role)) throw forbidden();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true },
    });
    if (!project) throw notFound("Project");
    if (project.orgId !== orgId) throw forbidden();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const data = parsed.data;
    if (Object.keys(data).length === 0) return apiError("VALIDATION_ERROR", "No fields provided.", 400);

    const override = await prisma.estimateLineOverride.upsert({
      where: { projectId_groupId: { projectId: params.id, groupId: params.groupId } },
      update: data,
      create: {
        orgId,
        projectId: params.id,
        groupId: params.groupId,
        wastePct: data.wastePct ?? 0,
        markupPct: data.markupPct ?? 0,
        notes: data.notes ?? null,
      },
    });

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "estimate_line.update",
      resourceId: override.id,
      meta: { projectId: params.id, groupId: params.groupId } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ override });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const orgId = token.orgId as string;
    const user = await withTenantGuard(token.id as string, orgId);
    if (!["OWNER", "ADMIN", "MEMBER"].includes(user.role)) throw forbidden();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true },
    });
    if (!project) throw notFound("Project");
    if (project.orgId !== orgId) throw forbidden();

    await prisma.estimateLineOverride.deleteMany({
      where: { projectId: params.id, groupId: params.groupId, orgId },
    });

    await appendAuditLog({
      orgId,
      userId: token.id as string,
      event: "estimate_line.reset",
      resourceId: `${params.id}:${params.groupId}`,
      meta: { projectId: params.id, groupId: params.groupId } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
