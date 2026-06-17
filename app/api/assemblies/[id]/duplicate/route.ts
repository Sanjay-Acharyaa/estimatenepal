import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { randomUUID } from "crypto";

// POST /api/assemblies/[id]/duplicate
// Creates a copy of any assembly (platform or org) into the user's org.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const user = { orgId, role: token.role as string };

    const source = await prisma.assembly.findUnique({
      where: { id: params.id },
      include: {
        groups: {
          where: { parentId: null },
          include: { children: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!source) throw notFound("Assembly");
    if (source.orgId && source.orgId !== orgId) throw forbidden();

    const copy = await prisma.assembly.create({
      data: {
        name: `${source.name} (Copy)`,
        description: source.description ?? undefined,
        category: source.category ?? undefined,
        orgId: orgId,
        isPublic: false,
        createdById: token.id as string,
      },
    });

    // Pre-generate parent IDs so children can reference them without sequential round-trips.
    const parentIds = source.groups.map(() => randomUUID());

    const parentRows = source.groups.map((grp, i) => ({
      id: parentIds[i],
      assemblyId: copy.id,
      parentId: null as string | null,
      name: grp.name,
      type: grp.type,
      colour: grp.colour,
      lineWidth: grp.lineWidth,
      additionalParams: (grp.additionalParams as any) ?? undefined,
      rateCode: grp.rateCode ?? null,
      sortOrder: grp.sortOrder,
    }));

    const childRows = source.groups.flatMap((grp, i) =>
      (grp.children as any[]).map((child: any) => ({
        assemblyId: copy.id,
        parentId: parentIds[i],
        name: child.name,
        type: child.type,
        colour: child.colour,
        lineWidth: child.lineWidth,
        additionalParams: child.additionalParams ?? undefined,
        rateCode: child.rateCode ?? null,
        sortOrder: child.sortOrder,
      }))
    );

    await prisma.$transaction(async (tx) => {
      if (parentRows.length > 0) await tx.assemblyGroup.createMany({ data: parentRows });
      if (childRows.length > 0) await tx.assemblyGroup.createMany({ data: childRows });
    });

    await appendAuditLog({
      orgId: orgId ?? "SYSTEM",
      userId: token.id as string,
      event: "assembly.duplicated",
      resourceId: copy.id,
      meta: { sourceId: params.id, sourceName: source.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ id: copy.id, name: copy.name }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
