import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const updateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  isPrimary: z.boolean().optional(),
  copy: z.boolean().optional(),
  progressPct: z.number().min(0).max(100).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; dId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);

    const discipline = await prisma.discipline.findUnique({ where: { id: params.dId } });
    if (!discipline || discipline.projectId !== params.id) throw notFound("Discipline");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    // Copy: duplicate discipline + all groups (category→layer hierarchy) + all items
    if (parsed.data.copy) {
      // Only OWNER or ADMIN may copy a discipline
      if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

      const groups = await prisma.takeoffGroup.findMany({
        where: { disciplineId: params.dId },
        include: { items: true },
        orderBy: { sortOrder: "asc" },
      });

      // Wrap the entire copy in a transaction so a mid-copy failure leaves no orphaned discipline.
      // The sortOrder lookup is inside the transaction to prevent a race condition where two
      // concurrent copy requests could derive the same sortOrder from the same findFirst result.
      const copy = await prisma.$transaction(async (tx) => {
        const last = await tx.discipline.findFirst({
          where: { projectId: params.id },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });

        const copyDisc = await tx.discipline.create({
          data: {
            projectId: params.id,
            name: `${discipline.name} (Copy)`,
            sortOrder: (last?.sortOrder ?? 0) + 1,
            isPrimary: false,
          },
        });

        // Step 1: copy categories (parentId=null) first and build oldId→newId map
        const categories = groups.filter(g => !g.parentId);
        const idMap = new Map<string, string>();
        for (const cat of categories) {
          const newCat = await tx.takeoffGroup.create({
            data: {
              projectId: params.id,
              disciplineId: copyDisc.id,
              parentId: null,
              name: cat.name,
              type: cat.type,
              colour: cat.colour,
              lineWidth: cat.lineWidth,
              isLocked: false,
              isVisible: true,
              tag: cat.tag,
              preamble: cat.preamble,
              multiplier: cat.multiplier,
              additionalParams: cat.additionalParams ?? undefined,
              rateItemId: cat.rateItemId,
              sortOrder: cat.sortOrder,
            },
          });
          idMap.set(cat.id, newCat.id);
        }

        // Step 2: copy layers (parentId=categoryId) using the id map; copy their items
        const layers = groups.filter(g => !!g.parentId);
        for (const layer of layers) {
          const newParentId = layer.parentId ? (idMap.get(layer.parentId) ?? null) : null;
          const newLayer = await tx.takeoffGroup.create({
            data: {
              projectId: params.id,
              disciplineId: copyDisc.id,
              parentId: newParentId,
              name: layer.name,
              type: layer.type,
              colour: layer.colour,
              lineWidth: layer.lineWidth,
              isLocked: false,
              isVisible: true,
              tag: layer.tag,
              preamble: layer.preamble,
              multiplier: layer.multiplier,
              additionalParams: layer.additionalParams ?? undefined,
              rateItemId: layer.rateItemId,
              sortOrder: layer.sortOrder,
            },
          });
          idMap.set(layer.id, newLayer.id);

          // Copy all items for this layer to the new layer (same pages)
          if (layer.items.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (tx.takeoffItem.createMany as any)({
              data: layer.items.map(item => ({
                pageId: item.pageId,
                groupId: newLayer.id,
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
              })),
            });
          }
        }

        return copyDisc;
      });

      const result = await prisma.discipline.findUnique({
        where: { id: copy.id },
        include: { _count: { select: { groups: true } } },
      });

      appendAuditLog({
        orgId: project.orgId,
        userId: token.id as string,
        event: "discipline.copied",
        resourceId: copy.id,
        meta: { sourceDisciplineId: params.dId, name: copy.name } as any,
        ipAddress: getClientIp(req),
      });

      return NextResponse.json(result, { status: 201 });
    }

    // Set as primary: unset all others first
    if (parsed.data.isPrimary === true) {
      await prisma.discipline.updateMany({
        where: { projectId: params.id },
        data: { isPrimary: false },
      });
    }

    const updated = await prisma.discipline.update({
      where: { id: params.dId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.isPrimary !== undefined && { isPrimary: parsed.data.isPrimary }),
      },
      include: { _count: { select: { groups: true } } },
    });

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "discipline.updated",
      resourceId: params.dId,
      meta: { name: parsed.data.name, isPrimary: parsed.data.isPrimary } as any,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; dId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const delCaller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(delCaller.role)) throw forbidden();

    const discipline = await prisma.discipline.findUnique({
      where: { id: params.dId },
      include: { _count: { select: { groups: true } } },
    });
    if (!discipline || discipline.projectId !== params.id) throw notFound("Discipline");

    // Prevent deleting the last tab
    const total = await prisma.discipline.count({ where: { projectId: params.id } });
    if (total <= 1) {
      return apiError("VALIDATION_ERROR", "Cannot delete the last tab. Rename it instead.", 400);
    }

    // Cascade: items → layers (parentId≠null) → categories (parentId=null) → discipline
    // Must delete in this order because TakeoffGroup has onDelete: Restrict on parentId FK.
    const groups = await prisma.takeoffGroup.findMany({
      where: { disciplineId: params.dId },
      select: { id: true, parentId: true },
    });

    const layerIds    = groups.filter(g => g.parentId !== null).map(g => g.id);
    const categoryIds = groups.filter(g => g.parentId === null).map(g => g.id);
    const allIds      = [...layerIds, ...categoryIds];

    if (allIds.length > 0) {
      // 1. Delete all takeoff items under every layer
      await prisma.takeoffItem.deleteMany({ where: { groupId: { in: allIds } } });
      // 2. Delete layers first (they reference categories via parentId)
      if (layerIds.length > 0) {
        await prisma.takeoffGroup.deleteMany({ where: { id: { in: layerIds } } });
      }
      // 3. Now safely delete categories (no children remain)
      if (categoryIds.length > 0) {
        await prisma.takeoffGroup.deleteMany({ where: { id: { in: categoryIds } } });
      }
    }

    await prisma.discipline.delete({ where: { id: params.dId } });

    // If the deleted tab was primary, promote the first remaining tab
    if (discipline.isPrimary) {
      const first = await prisma.discipline.findFirst({
        where: { projectId: params.id },
        orderBy: { sortOrder: "asc" },
      });
      if (first) await prisma.discipline.update({ where: { id: first.id }, data: { isPrimary: true } });
    }

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "discipline.deleted",
      resourceId: params.dId,
      meta: { name: discipline.name, groupCount: discipline._count.groups } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
