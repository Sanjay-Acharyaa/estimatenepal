import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; drawingId: string; pageId: string; commentId: string } };

async function guardAndGetUser(req: NextRequest, projectId: string) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project");
  await withTenantGuard(token.id as string, project.orgId);
  return { userId: token.id as string };
}

const patchSchema = z.object({
  text:     z.string().min(1).max(2000).optional(),
  resolved: z.boolean().optional(),
});

// PATCH /api/.../comments/[commentId]  — edit text or toggle resolved
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { userId } = await guardAndGetUser(req, params.id);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400);

    const existing = await prisma.drawingComment.findUnique({
      where: { id: params.commentId },
      select: { pageId: true, authorId: true },
    });
    if (!existing || existing.pageId !== params.pageId)
      return apiError("NOT_FOUND", "Comment not found.", 404);

    const data: Record<string, unknown> = {};
    if (parsed.data.text !== undefined) {
      if (existing.authorId !== userId)
        return apiError("FORBIDDEN", "Cannot edit another user's comment.", 403);
      data.text = parsed.data.text;
    }
    if (parsed.data.resolved !== undefined) {
      data.resolvedAt = parsed.data.resolved ? new Date() : null;
    }

    const updated = await prisma.drawingComment.update({
      where: { id: params.commentId },
      data,
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/.../comments/[commentId]
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { userId } = await guardAndGetUser(req, params.id);

    const existing = await prisma.drawingComment.findUnique({
      where: { id: params.commentId },
      select: { pageId: true, authorId: true },
    });
    if (!existing || existing.pageId !== params.pageId)
      return apiError("NOT_FOUND", "Comment not found.", 404);

    if (existing.authorId !== userId)
      return apiError("FORBIDDEN", "Cannot delete another user's comment.", 403);

    await prisma.drawingComment.delete({ where: { id: params.commentId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
