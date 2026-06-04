import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, conflict } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { rectanglesOverlap } from "@/lib/scale";

const createSchema = z.object({
  label: z.string().max(100).optional(),
  scale: z.number().positive(),
  scaleUnit: z.enum(["m", "mm", "ft", "in"]),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
});


export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string } }
) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const zones = await prisma.scaleZone.findMany({
      where: { pageId: params.pageId },
    });

    return NextResponse.json(zones);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string } }
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

    const page = await prisma.drawingPage.findUnique({ where: { id: params.pageId } });
    if (!page || page.drawingId !== params.drawingId) throw notFound("Page");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const newRect = {
      x: parsed.data.x,
      y: parsed.data.y,
      width: parsed.data.width,
      height: parsed.data.height,
    };

    // Serializable transaction: overlap check + insert as one atomic operation
    const zone = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.scaleZone.findMany({
          where: { pageId: params.pageId },
        });
        if (existing.some((z) => rectanglesOverlap(newRect, z))) {
          throw conflict("Scale zone overlaps an existing zone on this page.");
        }
        return tx.scaleZone.create({
          data: { pageId: params.pageId, ...parsed.data },
        });
      },
      { isolationLevel: "Serializable" }
    );

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "scale_zone.created",
      resourceId: zone.id,
      meta: { pageId: params.pageId, scale: parsed.data.scale, scaleUnit: parsed.data.scaleUnit },
      ipAddress: ip,
    });

    return NextResponse.json(zone, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
