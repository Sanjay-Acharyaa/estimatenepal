import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, conflict } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { rectanglesOverlap } from "@/lib/scale";

const updateSchema = z.object({
  label: z.string().max(100).optional(),
  scale: z.number().positive().optional(),
  scaleUnit: z.enum(["m", "mm", "ft", "in"]).optional(),
  // Geometry is updatable so the overlap check must run on PUT too
  x: z.number().min(0).optional(),
  y: z.number().min(0).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string; zoneId: string } }
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

    const zone = await prisma.scaleZone.findUnique({ where: { id: params.zoneId } });
    if (!zone || zone.pageId !== params.pageId) throw notFound("Scale zone");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    // Build the candidate geometry (merge patch with existing)
    const candidate = {
      x: parsed.data.x ?? zone.x,
      y: parsed.data.y ?? zone.y,
      width: parsed.data.width ?? zone.width,
      height: parsed.data.height ?? zone.height,
    };

    // Only run overlap check if geometry actually changed
    const geometryChanged =
      parsed.data.x !== undefined ||
      parsed.data.y !== undefined ||
      parsed.data.width !== undefined ||
      parsed.data.height !== undefined;

    if (geometryChanged) {
      const updated = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.scaleZone.findMany({
            where: { pageId: params.pageId, id: { not: params.zoneId } },
          });
          if (existing.some((z) => rectanglesOverlap(candidate, z))) {
            throw conflict("Updated zone would overlap an existing zone on this page.");
          }
          return tx.scaleZone.update({
            where: { id: params.zoneId },
            data: parsed.data,
          });
        },
        { isolationLevel: "Serializable" }
      );

      await appendAuditLog({
        orgId: project.orgId,
        userId: token.id as string,
        event: "scale_zone.updated",
        resourceId: params.zoneId,
        meta: parsed.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
        ipAddress: ip,
      });

      return NextResponse.json(updated);
    }

    // No geometry change — simple update, no overlap check needed
    const updated = await prisma.scaleZone.update({
      where: { id: params.zoneId },
      data: parsed.data,
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "scale_zone.updated",
      resourceId: params.zoneId,
      meta: parsed.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string; zoneId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const zone = await prisma.scaleZone.findUnique({ where: { id: params.zoneId } });
    if (!zone || zone.pageId !== params.pageId) throw notFound("Scale zone");

    await prisma.scaleZone.delete({ where: { id: params.zoneId } });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "scale_zone.deleted",
      resourceId: params.zoneId,
      meta: { pageId: params.pageId },
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Scale zone deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
