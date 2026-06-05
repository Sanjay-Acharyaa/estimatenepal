import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { checkApiRateLimit } from "@/lib/security";

const updateSchema = z.object({
  name: z.string().min(1).max(150).trim().optional(),
  type: z.enum(["LINEAR", "AREA", "VOLUME", "COUNT", "COUNT_BY_DISTANCE", "VERTICAL_WALL_AREA"]).optional(),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  lineWidth: z.number().int().min(1).max(10).optional(),
  rateCode: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().optional(),
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
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const role = token.role as string;
    if (!["OWNER", "ADMIN"].includes(role)) throw forbidden();

    await guardGroup(params.id, params.groupId, orgId);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.assemblyGroup.update({
      where: { id: params.groupId },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/assemblies/[id]/groups/[groupId]
export async function DELETE(req: NextRequest, { params }: { params: { id: string; groupId: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
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
