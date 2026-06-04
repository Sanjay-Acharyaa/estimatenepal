import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";

const updateSchema = z.object({ content: z.string().min(1).max(5000).trim() });

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; nId: string } }
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

    const note = await prisma.projectNote.findUnique({ where: { id: params.nId } });
    if (!note || note.projectId !== params.id) throw notFound("Note");
    if (note.userId !== token.id) throw forbidden();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.projectNote.update({
      where: { id: params.nId },
      data: { content: parsed.data.content },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "note.updated",
      resourceId: params.nId,
      meta: { projectId: params.id } as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; nId: string } }
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

    const note = await prisma.projectNote.findUnique({ where: { id: params.nId } });
    if (!note || note.projectId !== params.id) throw notFound("Note");

    const isAdmin = ["OWNER", "ADMIN"].includes(token.role as string);
    if (note.userId !== token.id && !isAdmin) throw forbidden();

    await prisma.projectNote.delete({ where: { id: params.nId } });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "note.deleted",
      resourceId: params.nId,
      meta: { projectId: params.id } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
