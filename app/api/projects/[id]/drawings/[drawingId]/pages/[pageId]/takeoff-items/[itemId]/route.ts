import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { computeQuantity, effectiveScale, type ToolData, type AdditionalParams } from "@/lib/takeoff";

const pointSchema = z.object({ x: z.number(), y: z.number() });

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

    const resolved = await resolveItem(params.pageId, params.drawingId, params.itemId);
    if (!resolved) throw notFound("Takeoff item");

    const item = await prisma.takeoffItem.findUnique({
      where: { id: params.itemId },
      include: { group: true },
    });

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
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    // Prevent editing locked item (unless unlocking it)
    if (item.isLocked && parsed.data.isLocked !== false) {
      return apiError("CONFLICT", "This takeoff item is locked.", 409);
    }

    // Optimistic locking: reject stale updates
    if (parsed.data.version !== undefined && item.version !== parsed.data.version) {
      return apiError("CONFLICT", "This shape was modified by another user. Please refresh.", 409);
    }

    // Recompute quantity if toolData or multiplier changed
    let quantityUpdate: { quantity?: number; rawQuantity?: number; unit?: string; scaleUsed?: number } = {};
    if (parsed.data.toolData || parsed.data.multiplier !== undefined) {
      if (!item.groupId) {
        return apiError("CONFLICT", "Cannot recompute quantity: item has no assigned group.", 409);
      }
      const toolData = (parsed.data.toolData ?? item.toolData) as ToolData;
      const multiplier = parsed.data.multiplier ?? item.multiplier;
      const scaleResult = effectiveScale(toolData.points, page.scale, page.scaleUnit, page.scaleZones);
      const scaleUsed = scaleResult?.scale ?? item.scaleUsed;
      const scaleUnit = scaleResult?.scaleUnit ?? page.scaleUnit;
      const group = await prisma.takeoffGroup.findUnique({ where: { id: item.groupId } });
      if (!group) return apiError("NOT_FOUND", "Takeoff group not found.", 404);
      const { quantity, rawQuantity, unit } = computeQuantity(
        item.toolType,
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

    await prisma.takeoffItem.delete({ where: { id: params.itemId } });
    return NextResponse.json({ message: "Takeoff item deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
