import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";

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
  additionalParams: z.record(z.string(), z.unknown()).optional(),
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
          select: { id: true, pageId: true, rawQuantity: true, quantity: true, unit: true, label: true, toolType: true, shapeType: true },
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
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

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

    await appendAuditLog({
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

    await appendAuditLog({
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
