import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  sortOrder: z.number().int().optional(),
  parentId: z.string().nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; fId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const folder = await prisma.drawingFolder.findUnique({ where: { id: params.fId } });
    if (!folder || folder.projectId !== params.id) throw notFound("Folder");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.drawingFolder.update({
      where: { id: params.fId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
        ...(parsed.data.parentId !== undefined && { parentId: parsed.data.parentId }),
      },
      include: { _count: { select: { drawings: true } } },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "folder.updated",
      resourceId: params.fId,
      meta: parsed.data as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; fId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const folder = await prisma.drawingFolder.findUnique({
      where: { id: params.fId },
      include: { _count: { select: { drawings: true, children: true } } },
    });
    if (!folder || folder.projectId !== params.id) throw notFound("Folder");

    if ((folder as any)._count.drawings > 0) {
      return apiError("CONFLICT", "Cannot delete a folder that contains drawings. Move the drawings first.", 409);
    }
    if ((folder as any)._count.children > 0) {
      return apiError("CONFLICT", "Cannot delete a folder that contains sub-folders.", 409);
    }

    await prisma.drawingFolder.delete({ where: { id: params.fId } });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "folder.deleted",
      resourceId: params.fId,
      meta: { name: folder.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
