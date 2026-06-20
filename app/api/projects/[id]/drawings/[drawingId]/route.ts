import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { getDownloadUrl, deleteFile } from "@/lib/upload";
import { forbidden } from "@/lib/errors";

const updateSchema = z.object({
  fileName: z.string().min(1).max(255).optional(),
  revisionNumber: z.string().max(20).optional(),
  folderId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETE"]).optional(),
});

async function resolveDrawing(projectId: string, drawingId: string) {
  const drawing = await prisma.drawing.findUnique({
    where: { id: drawingId },
    include: {
      pages: {
        orderBy: { pageNumber: "asc" },
        include: { scaleZones: true },
      },
    },
  });
  if (!drawing || drawing.projectId !== projectId) throw notFound("Drawing");
  return drawing;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const drawing = await resolveDrawing(params.id, params.drawingId);

    // Build revision history
    const revisions = await prisma.drawing.findMany({
      where: { parentDrawingId: drawing.id },
      select: { id: true, revisionNumber: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const downloadUrl = await getDownloadUrl(drawing.fileUrl);

    return NextResponse.json({ ...drawing, downloadUrl, revisions });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const drawing = await resolveDrawing(params.id, params.drawingId);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const updated = await prisma.drawing.update({
      where: { id: drawing.id },
      data: parsed.data,
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "drawing.renamed",
      resourceId: drawing.id,
      meta: parsed.data as Prisma.InputJsonValue,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    const drawing = await prisma.drawing.findUnique({
      where: { id: params.drawingId },
      select: { id: true, projectId: true, fileUrl: true, fileName: true, fileSizeBytes: true, pages: { select: { id: true } } },
    });
    if (!drawing || drawing.projectId !== params.id) throw notFound("Drawing");

    const pageIds = drawing.pages.map((p) => p.id);

    // Cascade delete: scale zones → pages → drawing in one transaction
    await prisma.$transaction([
      prisma.scaleZone.deleteMany({ where: { pageId: { in: pageIds } } }),
      prisma.drawingPage.deleteMany({ where: { drawingId: params.drawingId } }),
      prisma.drawing.delete({ where: { id: params.drawingId } }),
    ]);

    // Delete file from storage (best-effort — don't fail the request if storage errors)
    try {
      await deleteFile(drawing.fileUrl);
    } catch {
      console.error(`Failed to delete storage file: ${drawing.fileUrl}`);
    }

    // Decrement org storage counter (best-effort — don't fail if update errors)
    if (drawing.fileSizeBytes > 0) {
      prisma.org.update({
        where: { id: project.orgId },
        data: { storageUsedBytes: { decrement: BigInt(drawing.fileSizeBytes) } },
      }).catch(() => {});
    }

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "drawing.deleted",
      resourceId: params.drawingId,
      meta: { fileName: drawing.fileName },
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Drawing deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
