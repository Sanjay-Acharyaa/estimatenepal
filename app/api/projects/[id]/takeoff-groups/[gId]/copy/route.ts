import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const copySchema = z.object({
  targetDisciplineId: z.string(),
  withObjects: z.boolean().default(false),
});

// Copies all TakeoffItems from originalGroupId to newGroupId using createMany (no N+1).
async function copyItems(originalGroupId: string, newGroupId: string) {
  const originals = await prisma.takeoffItem.findMany({ where: { groupId: originalGroupId } });
  if (originals.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.takeoffItem.createMany as any)({
    data: originals.map(item => ({
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
      toolData: item.toolData,
      rateItemId: item.rateItemId,
    })),
  });
  return originals;
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
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const { targetDisciplineId, withObjects } = parsed.data;

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
          rateItemId: original.rateItemId ?? undefined,
          isLocked: false,
          isVisible: true,
          sortOrder: original.sortOrder + 1,
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
        for (let i = 0; i < original.children.length; i++) {
          const copied = await copyItems(original.children[i].id, layerIds[i]);
          allCopiedItems.push(...copied);
        }
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

      await appendAuditLog({
        orgId: project.orgId,
        userId: token.id as string,
        event: "takeoff_group.copied",
        resourceId: newCat.id,
        meta: { sourceGroupId: params.gId, targetDisciplineId, withObjects } as any,
        ipAddress: ip,
      });

      return NextResponse.json(
        { category: { ...newCat, disciplineId: targetDisciplineId }, layers: newLayers, copiedItems: allCopiedItems },
        { status: 201 }
      );
    } else {
      // ── Copy single layer ─────────────────────────────────────────────────
      let targetParentId: string | null = original.parentId;

      // If copying to a different tab, find or create the parent category there
      if (targetDisciplineId !== original.disciplineId && original.parentId) {
        const origParent = await prisma.takeoffGroup.findUnique({ where: { id: original.parentId } });
        if (origParent) {
          const existing = await prisma.takeoffGroup.findFirst({
            where: { projectId: params.id, disciplineId: targetDisciplineId, parentId: null, name: origParent.name },
          });
          if (existing) {
            targetParentId = existing.id;
          } else {
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
                rateItemId: origParent.rateItemId ?? undefined,
                isLocked: false,
                isVisible: true,
                sortOrder: origParent.sortOrder,
              },
              include: { _count: { select: { items: true } }, rateItem: { select: { code: true, source: true } } },
            });
            targetParentId = newParent.id;
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newLayer = await (prisma.takeoffGroup.create as any)({
        data: {
          projectId: params.id,
          disciplineId: targetDisciplineId,
          parentId: targetParentId,
          name: `${original.name} (Copy)`,
          type: original.type,
          colour: original.colour,
          lineWidth: original.lineWidth,
          tag: original.tag,
          multiplier: original.multiplier,
          additionalParams: original.additionalParams ?? undefined,
          preamble: original.preamble ?? undefined,
          rateItemId: original.rateItemId ?? undefined,
          isLocked: false,
          isVisible: true,
          sortOrder: original.sortOrder + 1,
        },
        include: { _count: { select: { items: true } }, rateItem: { select: { code: true, source: true } } },
      });

      const copiedItems = withObjects ? await copyItems(original.id, newLayer.id) : [];

      await appendAuditLog({
        orgId: project.orgId,
        userId: token.id as string,
        event: "takeoff_group.copied",
        resourceId: newLayer.id,
        meta: { sourceGroupId: params.gId, targetDisciplineId, withObjects } as any,
        ipAddress: ip,
      });

      return NextResponse.json(
        { layer: { ...newLayer, parentId: targetParentId, disciplineId: targetDisciplineId }, targetParentId, copiedItems },
        { status: 201 }
      );
    }
  } catch (err) {
    return handleApiError(err);
  }
}
