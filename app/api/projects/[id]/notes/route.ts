import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { parsePagination, paginatedResponse } from "@/lib/pagination";

const createSchema = z.object({
  content: z.string().min(1).max(5000).trim(),
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
    const [total, notes] = await Promise.all([
      prisma.projectNote.count({ where: { projectId: params.id } }),
      prisma.projectNote.findMany({
        where: { projectId: params.id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json(paginatedResponse(notes, total, page, limit));
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
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const note = await prisma.projectNote.create({
      data: { projectId: params.id, userId: token.id as string, content: parsed.data.content },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "note.created",
      resourceId: note.id,
      meta: { projectId: params.id } as any,
      ipAddress: ip,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
