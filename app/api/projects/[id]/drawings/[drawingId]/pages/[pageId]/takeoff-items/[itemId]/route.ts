import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { computeQuantity, perSegmentEffectiveScale, boundingBoxWeightedScale, MIN_SHAPE_POINTS, type ToolData, type AdditionalParams } from "@/lib/takeoff";
import { invalidateBOQCache } from "@/lib/boq";

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const updateSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  toolData: z.object({ points: z.array(pointSchema).min(1) }).optional(),
  multiplier: z.number().positive().optional(),
  isNegative: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  groupId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  wastagePct: z.number().min(0).max(100).optional(),
  siteLocation: z.string().max(500).nullable().optional(),
  measuredDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  version: z.number().int().optional(), // optimistic lock: client echoes back the version it last saw
});

async function resolveItem(pageId: string, drawingId: string, itemId: string) {
  const page = await prisma.drawingPage.findUnique({
    where: { id: pageId },
    include: { scaleZones: true },
  });
  if (!page || page.drawingId !== drawingId) return null;
  const item = await prisma.takeoffItem.findUnique({ where: { id: itemId } });
  if (!item || item.pageId !== pageId) return null;
  return { page, item };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string; itemId: string } }
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

    const item = await prisma.takeoffItem.findFirst({
      where: { id: params.itemId, pageId: params.pageId, page: { drawingId: params.drawingId } },
      include: { group: true },
    });
    if (!item) throw notFound("Takeoff item");

    return NextResponse.json(item);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string; itemId: string } }
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

    const resolved = await resolveItem(params.pageId, params.drawingId, params.itemId);
    if (!resolved) throw notFound("Takeoff item");
    const { page, item } = resolved;

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    // Validate point count per shape type when toolData is being updated.
    if (parsed.data.toolData && item.shapeType) {
      const min = MIN_SHAPE_POINTS[item.shapeType] ?? 1;
      if (parsed.data.toolData.points.length < min) {
        return apiError("VALIDATION_ERROR", `${item.shapeType} requires at least ${min} point(s).`, 400);
      }
      if (item.shapeType === "RECTANGLE" && parsed.data.toolData.points.length !== 4) {
        return apiError("VALIDATION_ERROR", `RECTANGLE requires exactly 4 points, got ${parsed.data.toolData.points.length}.`, 400);
      }
    }

    // Prevent editing locked item (unless unlocking it)
    if (item.isLocked && parsed.data.isLocked !== false) {
      return apiError("CONFLICT", "This takeoff item is locked.", 409);
    }

    // Optimistic locking: reject stale updates.
    // Clients that perform writes must echo back the version they last saw.
    // Requests that omit version entirely bypass the check (legacy or simple toggle
    // callers that don't need concurrency protection); once all write paths consistently
    // echo version this guard will be unconditional.
    if (parsed.data.version !== undefined && item.version !== parsed.data.version) {
      return apiError("CONFLICT", "This shape was modified by another user. Please refresh.", 409);
    }

    // When groupId changes, validate the target group belongs to this project and is not locked.
    const targetGroupId = parsed.data.groupId ?? item.groupId;
    if (parsed.data.groupId && parsed.data.groupId !== item.groupId) {
      const newGroup = await prisma.takeoffGroup.findUnique({ where: { id: parsed.data.groupId } });
      if (!newGroup || newGroup.projectId !== params.id) throw notFound("Takeoff group");
      if (newGroup.isLocked) return apiError("FORBIDDEN", "The target layer is locked.", 403);
    }

    // Recompute quantity if toolData, multiplier, or the target group changed.
    // A group change must recompute because the new group may have different additionalParams
    // (e.g. moving from LINEAR to VERTICAL_WALL_AREA requires perimeter × wall-height calculation).
    const groupChanged = !!parsed.data.groupId && parsed.data.groupId !== item.groupId;
    let quantityUpdate: { quantity?: number; rawQuantity?: number; unit?: string; scaleUsed?: number } = {};
    if (parsed.data.toolData || parsed.data.multiplier !== undefined || groupChanged) {
      if (!targetGroupId) {
        return apiError("CONFLICT", "Cannot recompute quantity: item has no assigned group.", 409);
      }
      const toolData = (parsed.data.toolData ?? item.toolData) as ToolData;
      const multiplier = parsed.data.multiplier ?? item.multiplier;
      const shapeType = item.shapeType ?? null;
      const scaleResult = shapeType === "POLYLINE"
        ? perSegmentEffectiveScale(toolData.points, page.scale, page.scaleUnit, page.scaleZones)
        : boundingBoxWeightedScale(toolData.points, page.scale, page.scaleUnit, page.scaleZones, shapeType);
      const scaleUsed = scaleResult?.scale ?? item.scaleUsed;
      const scaleUnit = scaleResult?.scaleUnit ?? page.scaleUnit;
      const group = await prisma.takeoffGroup.findUnique({ where: { id: targetGroupId } });
      if (!group) return apiError("NOT_FOUND", "Takeoff group not found.", 404);
      const computeTool = group.type === "VOLUME" ? "VOLUME" : item.toolType;
      const { quantity, rawQuantity, unit } = computeQuantity(
        computeTool,
        toolData,
        scaleUsed,
        scaleUnit,
        multiplier,
        group.additionalParams as AdditionalParams | undefined,
        item.shapeType ?? null
      );
      quantityUpdate = { quantity, rawQuantity, unit, scaleUsed };
    }

    const { version: _v, ...dataWithoutVersion } = parsed.data;
    const updated = await prisma.takeoffItem.update({
      where: { id: params.itemId },
      data: {
        ...dataWithoutVersion,
        toolData: parsed.data.toolData as any,
        measuredDate: parsed.data.measuredDate ? new Date(parsed.data.measuredDate) : parsed.data.measuredDate,
        version: { increment: 1 },
        ...quantityUpdate,
      },
      include: { group: { select: { id: true, name: true, colour: true } } },
    });

    invalidateBOQCache(params.id).catch(() => {});
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string; itemId: string } }
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

    const resolved = await resolveItem(params.pageId, params.drawingId, params.itemId);
    if (!resolved) throw notFound("Takeoff item");

    if (resolved.item.isLocked) {
      return apiError("CONFLICT", "Cannot delete a locked takeoff item.", 409);
    }

    if (resolved.item.groupId) {
      const group = await prisma.takeoffGroup.findUnique({
        where: { id: resolved.item.groupId },
        select: { isLocked: true },
      });
      if (group?.isLocked) {
        return apiError("CONFLICT", "Cannot delete an item from a locked group.", 409);
      }
    }

    await prisma.takeoffItem.delete({ where: { id: params.itemId } });
    invalidateBOQCache(params.id).catch(() => {});
    return NextResponse.json({ message: "Takeoff item deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
