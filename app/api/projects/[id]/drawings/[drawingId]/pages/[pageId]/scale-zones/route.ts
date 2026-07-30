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
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const page = await prisma.drawingPage.findUnique({ where: { id: params.pageId } });
    if (!page || page.drawingId !== params.drawingId) throw notFound("Page");

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
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    if (project.isPricingLocked) return apiError("FORBIDDEN", "Estimate pricing is locked. Unlock it in project settings before making takeoff changes.", 403);

    const page = await prisma.drawingPage.findUnique({ where: { id: params.pageId } });
    if (!page || page.drawingId !== params.drawingId) throw notFound("Page");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
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

    // Recompute all items on this page — the new zone changes effectiveScale for any
    // shape whose centroid falls inside it. Mirrors the same block in PUT/DELETE.
    const [allZones, items] = await Promise.all([
      prisma.scaleZone.findMany({ where: { pageId: params.pageId } }),
      prisma.takeoffItem.findMany({
        where: { pageId: params.pageId, groupId: { not: null } },
        include: { group: { select: { type: true, multiplier: true, additionalParams: true } } },
      }),
    ]);
    if (items.length > 0) {
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
        invalidateBOQCache(params.id).catch(() => {});
      }
    }

    appendAuditLog({
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
