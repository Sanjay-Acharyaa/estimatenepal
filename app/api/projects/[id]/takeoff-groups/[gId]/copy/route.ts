import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { invalidateBOQCache } from "@/lib/boq";
import { computeQuantity, perSegmentEffectiveScale, boundingBoxWeightedScale, type AdditionalParams } from "@/lib/takeoff";
import { randomUUID } from "crypto";

const copySchema = z.object({
  targetDisciplineId: z.string(),
  withObjects: z.boolean().default(false),
  targetGroupId: z.string().optional(),
  colour: z.string().optional(), // override colour for single-layer copies; ignored for categories
});

// Copies all TakeoffItems from originalGroupId to newGroupId using createMany (no N+1).
// Pre-assigns UUIDs so we can fetch the newly created records and return their real IDs.
async function copyItems(originalGroupId: string, newGroupId: string) {
  const originals = await prisma.takeoffItem.findMany({ where: { groupId: originalGroupId } });
  if (originals.length === 0) return [];
  const newIds = originals.map(() => randomUUID());
  // Prisma's CreateManyInput omits `id` (auto-generated field), but explicit IDs are valid
  // and allow us to build `newIds` up front for the findMany return instead of a second query.
  // UncheckedCreateManyInput includes `id`.
  await prisma.takeoffItem.createMany({
    data: originals.map((item, i): Prisma.TakeoffItemUncheckedCreateInput => ({
      id: newIds[i],
      pageId: item.pageId,
      groupId: newGroupId,
      label: item.label,
      toolType: item.toolType,
      shapeType: item.shapeType,
      isNegative: item.isNegative,
      isLocked: false,
      multiplier: item.multiplier,
      length: item.length,
      breadth: item.breadth,
      height: item.height,
      wastagePct: item.wastagePct,
      siteLocation: item.siteLocation,
      measuredDate: item.measuredDate,
      notes: item.notes,
      rawQuantity: item.rawQuantity,
      quantity: item.quantity,
      unit: item.unit,
      scaleUsed: item.scaleUsed,
      sortOrder: item.sortOrder,
      toolData: item.toolData as Prisma.InputJsonValue,
    })),
  });
  // Return the actual created records (not originals) so callers have correct IDs and groupId.
  return prisma.takeoffItem.findMany({ where: { id: { in: newIds } }, orderBy: { sortOrder: "asc" } });
}

export async function POST(
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

    const body = await req.json();
    const parsed = copySchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const { targetDisciplineId, withObjects, targetGroupId } = parsed.data;

    // Verify target discipline belongs to this project
    const targetDisc = await prisma.discipline.findUnique({ where: { id: targetDisciplineId } });
    if (!targetDisc || targetDisc.projectId !== params.id) throw notFound("Target tab");

    const original = await prisma.takeoffGroup.findUnique({
      where: { id: params.gId },
      include: {
        // Fetch ALL child layers regardless of lock/visibility state
        children: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!original || original.projectId !== params.id) throw notFound("Group");

    const isCategory = !original.parentId;

    if (isCategory) {
      // ── Copy category + ALL its layers (+ optionally all items) ─────────────
      // Copies are always created unlocked + visible so they're ready to edit.
      const maxCatSort = await prisma.takeoffGroup.findFirst({
        where: { projectId: params.id, disciplineId: targetDisciplineId, parentId: null },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newCat = await (prisma.takeoffGroup.create as any)({
        data: {
          projectId: params.id,
          disciplineId: targetDisciplineId,
          name: `${original.name} (Copy)`,
          type: original.type,
          colour: original.colour,
          lineWidth: original.lineWidth,
          tag: original.tag,
          multiplier: original.multiplier,
          additionalParams: original.additionalParams ?? undefined,
          preamble: original.preamble ?? undefined,
          // rateItemId is intentionally omitted: categories (parentId=null) are not used in
          // BOQ calculation — only their child layers are. Copying the category's rateItemId
          // would produce dead data that could mislead future code.
          isLocked: false,
          isVisible: true,
          sortOrder: (maxCatSort?.sortOrder ?? -1) + 1,
        },
        include: { _count: { select: { items: true } }, rateItem: { select: { code: true, source: true } } },
      });

      // Pre-generate layer IDs so we can createMany in one shot and copy items without
      // sequential awaits (N+1 avoidance).
      const layerIds = original.children.map(() => randomUUID());

      if (original.children.length > 0) {
        await (prisma.takeoffGroup.createMany as any)({
          data: original.children.map((layer, i) => ({
            id: layerIds[i],
            projectId: params.id,
            disciplineId: targetDisciplineId,
            parentId: newCat.id,
            name: layer.name,
            type: layer.type,
            colour: layer.colour,
            lineWidth: layer.lineWidth,
            tag: layer.tag,
            multiplier: layer.multiplier,
            additionalParams: layer.additionalParams ?? undefined,
            preamble: layer.preamble ?? undefined,
            rateItemId: layer.rateItemId ?? undefined,
            isLocked: false,
            isVisible: true,
            sortOrder: layer.sortOrder,
          })),
        });
      }

      const allCopiedItems: unknown[] = [];
      if (withObjects) {
        const batches = await Promise.all(
          original.children.map((child, i) => copyItems(child.id, layerIds[i]))
        );
        for (const batch of batches) allCopiedItems.push(...batch);
      }

      // Fetch the created layers with relations for the response
      const newLayerRecords = layerIds.length > 0
        ? await (prisma.takeoffGroup.findMany as any)({
            where: { id: { in: layerIds } },
            include: { _count: { select: { items: true } }, rateItem: { select: { code: true, source: true } } },
            orderBy: { sortOrder: "asc" },
          })
        : [];
      const newLayers = newLayerRecords.map((l: any) => ({ ...l, parentId: newCat.id, disciplineId: targetDisciplineId }));

      appendAuditLog({
        orgId: project.orgId,
        userId: token.id as string,
        event: "takeoff_group.copied",
        resourceId: newCat.id,
        meta: { sourceGroupId: params.gId, targetDisciplineId, withObjects } as any,
        ipAddress: ip,
      });

      invalidateBOQCache(params.id).catch(() => {});
      return NextResponse.json(
        { category: { ...newCat, disciplineId: targetDisciplineId }, layers: newLayers, copiedItems: allCopiedItems },
        { status: 201 }
      );
    } else {
      // ── Copy single layer ─────────────────────────────────────────────────
      let targetParentId: string | null = original.parentId;

      // If a specific target group is requested, validate and use it directly
      if (targetGroupId) {
        const targetGroup = await prisma.takeoffGroup.findUnique({ where: { id: targetGroupId } });
        if (!targetGroup || targetGroup.projectId !== params.id || targetGroup.parentId !== null || targetGroup.disciplineId !== targetDisciplineId) {
          return apiError("NOT_FOUND", "Target group not found in this project.", 404);
        }
        targetParentId = targetGroupId;
      // If copying to a different tab (and no explicit group chosen), find or create the parent category there
      } else if (targetDisciplineId !== original.disciplineId && original.parentId) {
        const origParent = await prisma.takeoffGroup.findUnique({ where: { id: original.parentId } });
        if (origParent) {
          const existing = await prisma.takeoffGroup.findFirst({
            where: { projectId: params.id, disciplineId: targetDisciplineId, parentId: null, name: origParent.name },
          });
          if (existing) {
            targetParentId = existing.id;
          } else {
            const maxParentSort = await prisma.takeoffGroup.findFirst({
              where: { projectId: params.id, disciplineId: targetDisciplineId, parentId: null },
              orderBy: { sortOrder: "desc" },
              select: { sortOrder: true },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newParent = await (prisma.takeoffGroup.create as any)({
              data: {
                projectId: params.id,
                disciplineId: targetDisciplineId,
                name: origParent.name,
                type: origParent.type,
                colour: origParent.colour,
                lineWidth: origParent.lineWidth,
                additionalParams: origParent.additionalParams ?? undefined,
                preamble: origParent.preamble ?? undefined,
                // rateItemId omitted: auto-created parent categories are category-level
                // placeholders — their rateItemId is dead data (BOQ only reads child layers).
                isLocked: false,
                isVisible: true,
                sortOrder: (maxParentSort?.sortOrder ?? -1) + 1,
              },
              include: { _count: { select: { items: true } }, rateItem: { select: { code: true, source: true } } },
            });
            targetParentId = newParent.id;
          }
        }
      }

      const maxLayerSort = await prisma.takeoffGroup.findFirst({
        where: { projectId: params.id, parentId: targetParentId ?? undefined },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newLayer = await (prisma.takeoffGroup.create as any)({
        data: {
          projectId: params.id,
          disciplineId: targetDisciplineId,
          parentId: targetParentId,
          name: `${original.name} (Copy)`,
          type: original.type,
          colour: parsed.data.colour ?? original.colour,
          lineWidth: original.lineWidth,
          tag: original.tag,
          multiplier: original.multiplier,
          additionalParams: original.additionalParams ?? undefined,
          preamble: original.preamble ?? undefined,
          rateItemId: original.rateItemId ?? undefined,
          isLocked: false,
          isVisible: true,
          sortOrder: (maxLayerSort?.sortOrder ?? -1) + 1,
        },
        include: { _count: { select: { items: true } }, rateItem: { select: { code: true, source: true } } },
      });

      let copiedItems = withObjects ? await copyItems(original.id, newLayer.id) : [];

      // When copying into an EXISTING layer (targetGroupId), that layer may have different
      // additionalParams than the source (e.g. different wall height, spacing, volume depth).
      // Recompute quantity/unit for the newly created items so the MB export and detail panel
      // show correct values for the target group's params.
      // rawQuantity is NOT updated here — it reflects correct geometry regardless of params.
      if (withObjects && targetGroupId && copiedItems.length > 0) {
        const targetGroup = await prisma.takeoffGroup.findUnique({
          where: { id: newLayer.id },
          select: { type: true, multiplier: true, additionalParams: true },
        });
        if (targetGroup) {
          const tgType = targetGroup.type as string;
          const tgParams = targetGroup.additionalParams as AdditionalParams | undefined;
          const tgMult = targetGroup.multiplier ?? 1;

          const itemsWithPages = await prisma.takeoffItem.findMany({
            where: { id: { in: copiedItems.map(i => i.id) } },
            include: { page: { include: { scaleZones: true } } },
          });

          const CHUNK = 100;
          const updateOps: ReturnType<typeof prisma.takeoffItem.update>[] = [];
          for (const item of itemsWithPages) {
            if (!item.page) continue;
            const pts = ((item.toolData as { points?: Array<{ x: number; y: number }> })?.points ?? []);
            const zones = item.page.scaleZones.map(z => ({
              x: z.x, y: z.y, width: z.width, height: z.height, scale: z.scale, scaleUnit: z.scaleUnit,
            }));
            const eff = item.shapeType === "POLYLINE"
              ? perSegmentEffectiveScale(pts, item.page.scale, item.page.scaleUnit, zones)
              : boundingBoxWeightedScale(pts, item.page.scale, item.page.scaleUnit, zones, item.shapeType ?? null);
            if (!eff) continue;
            const { quantity, unit } = computeQuantity(
              tgType as any,
              { points: pts },
              eff.scale,
              eff.scaleUnit,
              tgMult,
              tgParams,
              item.shapeType ?? null,
            );
            updateOps.push(prisma.takeoffItem.update({ where: { id: item.id }, data: { quantity, unit } }));
          }
          for (let i = 0; i < updateOps.length; i += CHUNK) {
            await prisma.$transaction(updateOps.slice(i, i + CHUNK));
          }
          // Refresh copiedItems to return updated quantities in the response
          copiedItems = await prisma.takeoffItem.findMany({
            where: { id: { in: copiedItems.map(i => i.id) } },
            orderBy: { sortOrder: "asc" },
          });
        }
      }

      appendAuditLog({
        orgId: project.orgId,
        userId: token.id as string,
        event: "takeoff_group.copied",
        resourceId: newLayer.id,
        meta: { sourceGroupId: params.gId, targetDisciplineId, withObjects } as any,
        ipAddress: ip,
      });

      invalidateBOQCache(params.id).catch(() => {});
      return NextResponse.json(
        { layer: { ...newLayer, parentId: targetParentId, disciplineId: targetDisciplineId }, targetParentId, copiedItems },
        { status: 201 }
      );
    }
  } catch (err) {
    return handleApiError(err);
  }
}
