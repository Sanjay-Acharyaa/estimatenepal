import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { invalidateBOQCache } from "@/lib/boq";
import { computeQuantity, perSegmentEffectiveScale, boundingBoxWeightedScale, type AdditionalParams } from "@/lib/takeoff";

const updateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  type: z.enum(["COUNT", "LINEAR", "COUNT_BY_DISTANCE", "AREA", "VOLUME", "VERTICAL_WALL_AREA"]).optional(),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  lineWidth: z.number().int().min(1).max(10).optional(),
  isLocked: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  tag: z.string().max(200).nullable().optional(),
  preamble: z.string().max(1000).nullable().optional(),
  rateItemId: z.string().nullable().optional(),
  multiplier: z.number().positive().optional(),
  additionalParams: z.record(z.string(), z.unknown()).optional().superRefine((ap, ctx) => {
    if (!ap) return;
    // Validate feet-and-inches sub-objects wherever they appear in additionalParams.
    // Covers height/breadth (VOLUME), wall (VERTICAL_WALL_AREA), and spacing (COUNT_BY_DISTANCE).
    const feetInchPairs: Array<{ ftKey: string; inKey: string; label: string }> = [
      { ftKey: "ft", inKey: "in", label: "spacing" },
    ];
    const checkFtIn = (obj: Record<string, unknown>, ftKey: string, inKey: string, label: string) => {
      const ft = obj[ftKey];
      const inches = obj[inKey];
      if (ft !== undefined && (typeof ft !== "number" || ft < 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [label, ftKey], message: `${label}.${ftKey} must be a non-negative number.` });
      }
      if (inches !== undefined && (typeof inches !== "number" || inches < 0 || inches > 11)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [label, inKey], message: `${label}.${inKey} must be between 0 and 11.` });
      }
    };
    // spacing: { ft, in }
    if (ap.spacing && typeof ap.spacing === "object") checkFtIn(ap.spacing as Record<string, unknown>, "ft", "in", "spacing");
    // height: { ft, in }
    if (ap.height && typeof ap.height === "object") checkFtIn(ap.height as Record<string, unknown>, "ft", "in", "height");
    // breadth: { ft, in }
    if (ap.breadth && typeof ap.breadth === "object") checkFtIn(ap.breadth as Record<string, unknown>, "ft", "in", "breadth");
    // wall: { heightFt, heightIn }
    if (ap.wall && typeof ap.wall === "object") {
      const wall = ap.wall as Record<string, unknown>;
      if (wall.heightFt !== undefined && (typeof wall.heightFt !== "number" || wall.heightFt < 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wall", "heightFt"], message: "wall.heightFt must be a non-negative number." });
      }
      if (wall.heightIn !== undefined && (typeof wall.heightIn !== "number" || wall.heightIn < 0 || wall.heightIn > 11)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wall", "heightIn"], message: "wall.heightIn must be between 0 and 11." });
      }
    }
    void feetInchPairs; // declared but only used inline above; suppress lint
  }),
  disciplineId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; gId: string } }
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

    const group = await prisma.takeoffGroup.findUnique({
      where: { id: params.gId },
      include: {
        discipline: { select: { id: true, name: true } },
        _count: { select: { items: true } },
        rateItem: { select: { id: true, code: true, description: true, unit: true, baseRate: true, source: true, fiscalYear: true } },
        items: {
          select: { id: true, pageId: true, rawQuantity: true, quantity: true, unit: true, label: true, toolType: true, shapeType: true, isNegative: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!group || group.projectId !== params.id) throw notFound("Takeoff group");
    return NextResponse.json(group);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; gId: string } }
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

    const group = await prisma.takeoffGroup.findUnique({ where: { id: params.gId } });
    if (!group || group.projectId !== params.id) throw notFound("Takeoff group");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const updated = await prisma.takeoffGroup.update({
      where: { id: params.gId },
      data: {
        ...parsed.data,
        additionalParams: parsed.data.additionalParams as any,
      },
      include: {
        _count: { select: { items: true } },
        rateItem: { select: { code: true, source: true } },
      },
    });

    // Recompute every item's stored quantity/unit when anything that affects the
    // formula changes: tool type, additionalParams (wall height, spacing, volume
    // dimensions), or multiplier.  The BOQ always derives from rawQuantity at read
    // time, so rawQuantity is only rewritten on type changes (it depends on geometry,
    // not on params).  quantity and unit must stay in sync with current params so the
    // Measurement Book and UI detail panels show correct per-item figures.
    const PARAMS_AFFECTING_TYPES = new Set(["VERTICAL_WALL_AREA", "COUNT_BY_DISTANCE", "VOLUME"]);
    const needsRecompute =
      !!parsed.data.type ||
      (parsed.data.additionalParams !== undefined && PARAMS_AFFECTING_TYPES.has(updated.type)) ||
      parsed.data.multiplier !== undefined;

    if (needsRecompute) {
      const newType = (parsed.data.type ?? group.type) as typeof group.type;
      const newParams = (parsed.data.additionalParams ?? group.additionalParams) as AdditionalParams | undefined;
      const newMultiplier = updated.multiplier ?? 1;
      const items = await prisma.takeoffItem.findMany({
        where: { groupId: params.gId },
        include: { page: { include: { scaleZones: true } } },
      });
      const updateOps: ReturnType<typeof prisma.takeoffItem.update>[] = [];
      for (const item of items) {
        if (!item.page) continue;
        const pts = ((item.toolData as { points?: Array<{ x: number; y: number }> })?.points ?? []);
        const zoneShapes = item.page.scaleZones.map(z => ({
          x: z.x, y: z.y, width: z.width, height: z.height, scale: z.scale, scaleUnit: z.scaleUnit,
        }));
        const eff = item.shapeType === "POLYLINE"
          ? perSegmentEffectiveScale(pts, item.page.scale, item.page.scaleUnit, zoneShapes)
          : boundingBoxWeightedScale(pts, item.page.scale, item.page.scaleUnit, zoneShapes, item.shapeType ?? null);
        if (!eff) continue;
        const { quantity, rawQuantity, unit } = computeQuantity(
          newType,
          { points: pts },
          eff.scale,
          eff.scaleUnit,
          newMultiplier,
          newParams,
          item.shapeType,
        );
        // Only write rawQuantity (geometry-dependent) when the type itself changed.
        const dataUpdate = parsed.data.type
          ? { toolType: newType, rawQuantity, quantity, unit, scaleUsed: eff.scale, version: { increment: 1 } }
          : { quantity, unit, version: { increment: 1 } };
        updateOps.push(prisma.takeoffItem.update({ where: { id: item.id }, data: dataUpdate }));
      }
      if (updateOps.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < updateOps.length; i += CHUNK) {
          await prisma.$transaction(updateOps.slice(i, i + CHUNK));
        }
      }
    }

    invalidateBOQCache(params.id).catch(() => {});

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "takeoff_group.updated",
      resourceId: params.gId,
      meta: parsed.data as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; gId: string } }
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

    if (!["OWNER", "ADMIN"].includes(token.role as string)) throw forbidden();

    const group = await prisma.takeoffGroup.findUnique({
      where: { id: params.gId },
      include: { children: { select: { id: true } } },
    });
    if (!group || group.projectId !== params.id) throw notFound("Takeoff group");

    const childIds = ((group as any).children as { id: string }[]).map(c => c.id);

    // Delete all takeoff items belonging to children and the group itself first,
    // so no orphaned items (groupId=null) are left behind after group deletion.
    const allGroupIds = [...childIds, params.gId];
    await prisma.takeoffItem.deleteMany({ where: { groupId: { in: allGroupIds } } });

    // Now delete child layers (Restrict FK requires manual cascade on the group tree)
    if (childIds.length > 0) {
      await prisma.takeoffGroup.deleteMany({ where: { parentId: params.gId } });
    }
    await prisma.takeoffGroup.delete({ where: { id: params.gId } });

    invalidateBOQCache(params.id).catch(() => {});

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "takeoff_group.deleted",
      resourceId: params.gId,
      meta: { name: group.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Takeoff group deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
