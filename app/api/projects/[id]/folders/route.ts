import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";

const DEFAULT_FOLDERS = ["General", "Architectural", "Structural", "Civil", "MEP"];

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const folders = await prisma.drawingFolder.findMany({
      where: { projectId: params.id },
      include: { _count: { select: { drawings: true } } },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(folders);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const last = await prisma.drawingFolder.findFirst({
      where: { projectId: params.id, parentId: parsed.data.parentId ?? null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const folder = await prisma.drawingFolder.create({
      data: {
        projectId: params.id,
        name: parsed.data.name,
        parentId: parsed.data.parentId ?? null,
        sortOrder: parsed.data.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      },
      include: { _count: { select: { drawings: true } } },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "folder.created",
      resourceId: folder.id,
      meta: { name: folder.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

