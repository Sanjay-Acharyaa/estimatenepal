import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { Prisma } from "@prisma/client";

const updateSchema = z.object({
  label: z.string().max(100).optional(),
  scale: z.number().positive().optional(),
  scaleUnit: z.enum(["m", "mm", "ft", "in"]).optional(),
  canvasJson: z.record(z.string(), z.unknown()).optional(),
  annotationsJson: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string } }
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

    const drawing = await prisma.drawing.findUnique({ where: { id: params.drawingId } });
    if (!drawing || drawing.projectId !== params.id) throw notFound("Drawing");

    const page = await prisma.drawingPage.findUnique({ where: { id: params.pageId } });
    if (!page || page.drawingId !== params.drawingId) throw notFound("Page");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    // Zod-validated payload — safe to cast JSON fields for Prisma.
    // Maintain the denormalized hasAnnotations flag when annotationsJson is updated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { ...parsed.data };
    if (parsed.data.annotationsJson !== undefined) {
      const a = parsed.data.annotationsJson as any;
      updateData.hasAnnotations = Array.isArray(a?.annotations) && a.annotations.length > 0;
    }

    const updated = await prisma.drawingPage.update({
      where: { id: params.pageId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
