import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; drawingId: string; pageId: string } };

async function guardAndGetUser(req: NextRequest, projectId: string) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project");
  await withTenantGuard(token.id as string, project.orgId);
  return { userId: token.id as string };
}

// GET /api/projects/[id]/drawings/[drawingId]/pages/[pageId]/comments
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    await guardAndGetUser(req, params.id);

    const comments = await prisma.drawingComment.findMany({
      where: { pageId: params.pageId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(comments);
  } catch (err) {
    return handleApiError(err);
  }
}

const postSchema = z.object({
  x:        z.number(),
  y:        z.number(),
  text:     z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

// POST /api/projects/[id]/drawings/[drawingId]/pages/[pageId]/comments
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { userId } = await guardAndGetUser(req, params.id);

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400);

    const comment = await prisma.drawingComment.create({
      data: {
        pageId:    params.pageId,
        projectId: params.id,
        x:         parsed.data.x,
        y:         parsed.data.y,
        text:      parsed.data.text,
        authorId:  userId,
        parentId:  parsed.data.parentId ?? null,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
