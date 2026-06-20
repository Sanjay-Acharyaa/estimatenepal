import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { getDownloadUrl } from "@/lib/upload";

const MAX_PAGES = 100;

const registerSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileKey: z.string().min(1),
  pageCount: z.number().int().min(1).max(MAX_PAGES, { message: "PDF must have ≤ 100 pages" }),
  fileSizeBytes: z.number().int().min(0).max(50 * 1024 * 1024).default(0),
  revisionNumber: z.string().max(20).optional(),
  parentDrawingId: z.string().optional(),
  folderId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

    const [drawings, total] = await Promise.all([
      prisma.drawing.findMany({
        where: { projectId: params.id, isLatest: true },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          pages: { select: { id: true, pageNumber: true, label: true, scale: true, scaleUnit: true }, orderBy: { pageNumber: "asc" } },
          _count: { select: { revisions: true } },
        },
      }),
      prisma.drawing.count({ where: { projectId: params.id, isLatest: true } }),
    ]);

    // Attach signed download URL + thumbnail URL to each drawing
    const withUrls = await Promise.all(
      drawings.map(async (d) => ({
        ...d,
        downloadUrl: await getDownloadUrl(d.fileUrl),
        thumbnailUrl: d.thumbnailUrl ? await getDownloadUrl(d.thumbnailUrl) : null,
      }))
    );

    return NextResponse.json(paginatedResponse(withUrls, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const { fileName, fileKey, pageCount, fileSizeBytes, revisionNumber, parentDrawingId, folderId } = parsed.data;

    // Ensure fileKey belongs to this org/project to prevent cross-tenant file linking
    const expectedPrefix = `drawings/${project.orgId}/${params.id}/`;
    if (!fileKey.startsWith(expectedPrefix)) {
      return apiError("VALIDATION_ERROR", "Invalid file key.", 400);
    }

    // If this is a revision, validate the parent and mark it as superseded
    if (parentDrawingId) {
      const parent = await prisma.drawing.findUnique({ where: { id: parentDrawingId } });
      if (!parent || parent.projectId !== params.id) {
        return apiError("NOT_FOUND", "Parent drawing not found.", 404);
      }
      if (!parent.isLatest) {
        return apiError("CONFLICT", "Cannot revision an already-superseded drawing. Use the latest version instead.", 409);
      }
      await prisma.drawing.update({ where: { id: parentDrawingId }, data: { isLatest: false } });
    }

    const drawing = await prisma.drawing.create({
      data: {
        projectId: params.id,
        fileName,
        fileUrl: fileKey,
        pageCount,
        fileSizeBytes,
        revisionNumber,
        parentDrawingId,
        folderId: folderId ?? null,
        isLatest: true,
        pages: {
          create: Array.from({ length: pageCount }, (_, i) => ({
            pageNumber: i + 1,
            label: `Page ${i + 1}`,
          })),
        },
      },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
      },
    });

    // Increment org storage counter
    if (fileSizeBytes > 0) {
      await prisma.org.update({
        where: { id: project.orgId },
        data: { storageUsedBytes: { increment: BigInt(fileSizeBytes) } },
      });
    }

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: parentDrawingId ? "drawing.revision_uploaded" : "drawing.uploaded",
      resourceId: drawing.id,
      meta: { fileName, pageCount },
      ipAddress: ip,
    });

    return NextResponse.json(drawing, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
