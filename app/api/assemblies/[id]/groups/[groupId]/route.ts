import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const updateSchema = z.object({
  name: z.string().min(1).max(150).trim().optional(),
  type: z.enum(["LINEAR", "AREA", "VOLUME", "COUNT", "COUNT_BY_DISTANCE", "VERTICAL_WALL_AREA"]).optional(),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  lineWidth: z.number().int().min(1).max(10).optional(),
  rateCode: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().optional(),
  scope: z.enum(["template", "all_projects"]).default("template"),
});

async function guardGroup(assemblyId: string, groupId: string, orgId: string | null) {
  const group = await prisma.assemblyGroup.findUnique({ where: { id: groupId }, include: { assembly: true } });
  if (!group || group.assemblyId !== assemblyId) throw notFound("Group");
  if (!group.assembly.orgId || group.assembly.orgId !== orgId) throw forbidden();
  return group;
}

// PUT /api/assemblies/[id]/groups/[groupId]
export async function PUT(req: NextRequest, { params }: { params: { id: string; groupId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const role = token.role as string;
    if (!["OWNER", "ADMIN"].includes(role)) throw forbidden();

    const group = await guardGroup(params.id, params.groupId, orgId);
    const assembly = await prisma.assembly.findUnique({ where: { id: params.id }, select: { name: true } });

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const { scope, ...updateData } = parsed.data;

    // Snapshot before values for notification diff
    const before = { name: group.name, type: group.type, colour: group.colour, rateCode: group.rateCode };

    const updated = await prisma.assemblyGroup.update({
      where: { id: params.groupId },
      data: updateData,
    });

    const after = { name: updated.name, type: updated.type, colour: updated.colour, rateCode: updated.rateCode };

    // If scope = all_projects, retroactively update existing project layers from this assembly
    let updatedProjects = 0;
    if (scope === "all_projects") {
      const result = await prisma.takeoffGroup.updateMany({
        where: { assemblyId: params.id, name: before.name },
        data: {
          ...(updateData.name ? { name: updateData.name } : {}),
          ...(updateData.type ? { type: updateData.type as any } : {}),
          ...(updateData.colour ? { colour: updateData.colour } : {}),
          ...(updateData.lineWidth ? { lineWidth: updateData.lineWidth } : {}),
        },
      });
      updatedProjects = result.count;
    }

    // Notify all org OWNER/ADMIN users about the change
    if (orgId) {
      const admins = await prisma.user.findMany({
        where: { orgId, role: { in: ["OWNER", "ADMIN"] } },
        select: { id: true },
      });
      const changes: string[] = [];
      if (before.name !== after.name) changes.push(`name: "${before.name}" → "${after.name}"`);
      if (before.type !== after.type) changes.push(`type: ${before.type} → ${after.type}`);
      if (before.colour !== after.colour) changes.push(`colour: ${before.colour} → ${after.colour}`);
      if (before.rateCode !== after.rateCode) changes.push(`rate code: ${before.rateCode ?? "none"} → ${after.rateCode ?? "none"}`);

      if (changes.length > 0 && admins.length > 0) {
        const message = `Assembly "${assembly?.name}" — layer "${before.name}" was updated${scope === "all_projects" ? ` (applied to ${updatedProjects} project layer${updatedProjects !== 1 ? "s" : ""})` : " (future projects only)"}.`;
        prisma.notification.createMany({
          data: admins.map(a => ({
            userId: a.id,
            type: "assembly.group_updated",
            message,
            link: "/dashboard/assemblies",
            meta: { assemblyId: params.id, assemblyName: assembly?.name, layerName: before.name, before, after, scope, updatedProjects },
          })),
        }).catch((err) => console.error("[assemblies/groups] notification failed:", err));
      }
    }

    return NextResponse.json({ ...updated, updatedProjects });
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/assemblies/[id]/groups/[groupId]
export async function DELETE(req: NextRequest, { params }: { params: { id: string; groupId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const role = token.role as string;
    if (!["OWNER", "ADMIN"].includes(role)) throw forbidden();

    const group = await guardGroup(params.id, params.groupId, orgId);

    // If it's a category (no parentId), also delete its children
    if (!group.parentId) {
      await prisma.assemblyGroup.deleteMany({ where: { parentId: params.groupId } });
    }
    await prisma.assemblyGroup.delete({ where: { id: params.groupId } });

    return NextResponse.json({ message: "Deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
