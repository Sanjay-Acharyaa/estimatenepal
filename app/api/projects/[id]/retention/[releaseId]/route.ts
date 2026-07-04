import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";

// DELETE /api/projects/[id]/retention/[releaseId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; releaseId: string } }
) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const release = await prisma.retentionRelease.findUnique({
      where: { id: params.releaseId },
      select: { projectId: true },
    });
    if (!release || release.projectId !== params.id)
      return apiError("NOT_FOUND", "Release not found.", 404);

    await prisma.retentionRelease.delete({ where: { id: params.releaseId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
