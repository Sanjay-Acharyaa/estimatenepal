import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { Prisma } from "@prisma/client";
import { computeQuantity, perSegmentEffectiveScale, boundingBoxWeightedScale, type AdditionalParams } from "@/lib/takeoff";
import { invalidateBOQCache } from "@/lib/boq";

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
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
    }

    // Guard scale changes against the pricing lock BEFORE writing to the DB, so the
    // page scale and item rawQuantity values never diverge.
    if ((parsed.data.scale !== undefined || parsed.data.scaleUnit !== undefined) && project.isPricingLocked) {
      return apiError("FORBIDDEN", "Estimate pricing is locked. Unlock it in project settings before making takeoff changes.", 403);
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

    // When scale or scaleUnit changes, recompute rawQuantity/quantity on every item
    // that belongs to this page so stored values stay in sync with the new calibration.
    if (parsed.data.scale !== undefined || parsed.data.scaleUnit !== undefined) {
      const newScale = parsed.data.scale ?? page.scale;
      const newScaleUnit = parsed.data.scaleUnit ?? page.scaleUnit;
      if (newScale && newScale > 0) {
        const [items, zones] = await Promise.all([
          prisma.takeoffItem.findMany({
            where: { pageId: params.pageId, groupId: { not: null } },
            include: { group: { select: { type: true, multiplier: true, additionalParams: true } } },
          }),
          prisma.scaleZone.findMany({ where: { pageId: params.pageId } }),
        ]);
        if (items.length > 0) {
          const zoneShapes = zones.map(z => ({ x: z.x, y: z.y, width: z.width, height: z.height, scale: z.scale, scaleUnit: z.scaleUnit }));
          const updateOps: ReturnType<typeof prisma.takeoffItem.update>[] = [];
          for (const item of items) {
            if (!item.group) continue;
            const pts = ((item.toolData as { points?: Array<{ x: number; y: number }> })?.points ?? []);
            const eff = item.shapeType === "POLYLINE"
              ? perSegmentEffectiveScale(pts, newScale, newScaleUnit, zoneShapes)
              : boundingBoxWeightedScale(pts, newScale, newScaleUnit, zoneShapes, item.shapeType ?? null);
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
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
