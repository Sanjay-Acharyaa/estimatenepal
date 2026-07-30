import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";

const DEFAULT_FOLDERS = ["General", "Architectural", "Structural", "Civil", "MEP"];

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
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
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const folder = await prisma.$transaction(async (tx) => {
      const last = await tx.drawingFolder.findFirst({
        where: { projectId: params.id, parentId: parsed.data.parentId ?? null },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      return tx.drawingFolder.create({
        data: {
          projectId: params.id,
          name: parsed.data.name,
          parentId: parsed.data.parentId ?? null,
          sortOrder: parsed.data.sortOrder ?? (last?.sortOrder ?? 0) + 1,
        },
        include: { _count: { select: { drawings: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    appendAuditLog({
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

