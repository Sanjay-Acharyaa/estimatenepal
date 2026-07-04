import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";

async function guard(req: NextRequest, projectId: string) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project");
  await withTenantGuard(token.id as string, project.orgId);
  return { userId: token.id as string };
}

// GET /api/projects/[id]/retention — fetch retention settings + releases
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard(req, params.id);

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { retentionEnabled: true, retentionPct: true },
    });
    if (!project) return apiError("NOT_FOUND", "Project not found.", 404);

    const releases = await prisma.retentionRelease.findMany({
      where: { projectId: params.id },
      orderBy: { releasedAt: "desc" },
    });

    return NextResponse.json({ ...project, releases });
  } catch (err) {
    return handleApiError(err);
  }
}

const settingsSchema = z.object({
  retentionEnabled: z.boolean(),
  retentionPct: z.number().min(0).max(100),
});

// PATCH /api/projects/[id]/retention — update retention settings
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard(req, params.id);

    const body = await req.json();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400);

    await prisma.project.update({
      where: { id: params.id },
      data: parsed.data,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

const releaseSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
  releasedAt: z.string().datetime().optional(),
});

// POST /api/projects/[id]/retention — record a release
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = await guard(req, params.id);

    const body = await req.json();
    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400);

    const release = await prisma.retentionRelease.create({
      data: {
        projectId: params.id,
        amount: parsed.data.amount,
        note: parsed.data.note ?? null,
        releasedAt: parsed.data.releasedAt ? new Date(parsed.data.releasedAt) : new Date(),
        createdById: userId,
      },
    });

    return NextResponse.json(release, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
