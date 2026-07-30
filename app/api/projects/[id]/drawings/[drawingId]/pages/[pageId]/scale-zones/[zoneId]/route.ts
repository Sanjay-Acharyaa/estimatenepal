import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, conflict } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { rectanglesOverlap } from "@/lib/scale";
import { computeQuantity, perSegmentEffectiveScale, boundingBoxWeightedScale, type AdditionalParams } from "@/lib/takeoff";
import { invalidateBOQCache } from "@/lib/boq";

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
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    if (project.isPricingLocked) return apiError("FORBIDDEN", "Estimate pricing is locked. Unlock it in project settings before making takeoff changes.", 403);

    const zone = await prisma.scaleZone.findUnique({ where: { id: params.zoneId } });
    if (!zone || zone.pageId !== params.pageId) throw notFound("Scale zone");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
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

    // Any change that affects which scale applies to a shape requires item recomputation.
    const needsRecompute =
      geometryChanged ||
      parsed.data.scale !== undefined ||
      parsed.data.scaleUnit !== undefined;

    let updated: Awaited<ReturnType<typeof prisma.scaleZone.update>>;

    if (geometryChanged) {
      updated = await prisma.$transaction(
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
    } else {
      // No geometry change — simple update, no overlap check needed
      updated = await prisma.scaleZone.update({
        where: { id: params.zoneId },
        data: parsed.data,
      });
    }

    // When scale, scaleUnit, or geometry changed, recompute every item on this page so
    // stored rawQuantity values stay in sync with the new zone configuration.
    // Mirrors the same logic in the DELETE handler and pages/[pageId]/route.ts.
    if (needsRecompute) {
      const [page, allZones, items] = await Promise.all([
        prisma.drawingPage.findUnique({ where: { id: params.pageId } }),
        prisma.scaleZone.findMany({ where: { pageId: params.pageId } }),
        prisma.takeoffItem.findMany({
          where: { pageId: params.pageId, groupId: { not: null } },
          include: { group: { select: { type: true, multiplier: true, additionalParams: true } } },
        }),
      ]);

      if (page && items.length > 0) {
        const zoneShapes = allZones.map(z => ({
          x: z.x, y: z.y, width: z.width, height: z.height, scale: z.scale, scaleUnit: z.scaleUnit,
        }));
        const updateOps: ReturnType<typeof prisma.takeoffItem.update>[] = [];
        for (const item of items) {
          if (!item.group) continue;
          const pts = ((item.toolData as { points?: Array<{ x: number; y: number }> })?.points ?? []);
          const eff = item.shapeType === "POLYLINE"
            ? perSegmentEffectiveScale(pts, page.scale, page.scaleUnit, zoneShapes)
            : boundingBoxWeightedScale(pts, page.scale, page.scaleUnit, zoneShapes, item.shapeType ?? null);
          if (!eff) continue;
          const { quantity, rawQuantity, unit } = computeQuantity(
            item.toolType,
            { points: pts },
            eff.scale,
            eff.scaleUnit,
            item.group.multiplier ?? 1,
            item.group.additionalParams as AdditionalParams | undefined,
            item.shapeType,
          );
          updateOps.push(
            prisma.takeoffItem.update({
              where: { id: item.id },
              data: { rawQuantity, quantity, unit, scaleUsed: eff.scale, version: { increment: 1 } },
            })
          );
        }
        if (updateOps.length > 0) {
          const CHUNK = 100;
          for (let i = 0; i < updateOps.length; i += CHUNK) {
            await prisma.$transaction(updateOps.slice(i, i + CHUNK));
          }
        }
        invalidateBOQCache(params.id).catch(() => {});
      }
    }

    appendAuditLog({
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
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    if (project.isPricingLocked) return apiError("FORBIDDEN", "Estimate pricing is locked. Unlock it in project settings before making takeoff changes.", 403);

    const zone = await prisma.scaleZone.findUnique({ where: { id: params.zoneId } });
    if (!zone || zone.pageId !== params.pageId) throw notFound("Scale zone");

    await prisma.scaleZone.delete({ where: { id: params.zoneId } });

    // Recompute all items on this page using the updated zone set (deleted zone excluded).
    // Mirrors the same logic in pages/[pageId]/route.ts scale-change handler.
    const [page, remainingZones, items] = await Promise.all([
      prisma.drawingPage.findUnique({ where: { id: params.pageId } }),
      prisma.scaleZone.findMany({ where: { pageId: params.pageId } }),
      prisma.takeoffItem.findMany({
        where: { pageId: params.pageId, groupId: { not: null } },
        include: { group: { select: { type: true, multiplier: true, additionalParams: true } } },
      }),
    ]);

    if (page && items.length > 0) {
      const zoneShapes = remainingZones.map(z => ({
        x: z.x, y: z.y, width: z.width, height: z.height, scale: z.scale, scaleUnit: z.scaleUnit,
      }));
      const updateOps: ReturnType<typeof prisma.takeoffItem.update>[] = [];
      for (const item of items) {
        if (!item.group) continue;
        const pts = ((item.toolData as { points?: Array<{ x: number; y: number }> })?.points ?? []);
        const eff = item.shapeType === "POLYLINE"
          ? perSegmentEffectiveScale(pts, page.scale, page.scaleUnit, zoneShapes)
          : boundingBoxWeightedScale(pts, page.scale, page.scaleUnit, zoneShapes, item.shapeType ?? null);
        if (!eff) continue;
        const { quantity, rawQuantity, unit } = computeQuantity(
          item.toolType,
          { points: pts },
          eff.scale,
          eff.scaleUnit,
          item.group.multiplier ?? 1,
          item.group.additionalParams as AdditionalParams | undefined,
          item.shapeType,
        );
        updateOps.push(
          prisma.takeoffItem.update({
            where: { id: item.id },
            data: { rawQuantity, quantity, unit, scaleUsed: eff.scale, version: { increment: 1 } },
          })
        );
      }
      if (updateOps.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < updateOps.length; i += CHUNK) {
          await prisma.$transaction(updateOps.slice(i, i + CHUNK));
        }
        invalidateBOQCache(params.id).catch(() => {});
      }
    }

    appendAuditLog({
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
