import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withTenantGuard } from "@/lib/auth";
import { getLatestDudbcFY } from "@/lib/rates";
import { randomUUID } from "crypto";
import { trackEvent } from "@/lib/analytics";

const schema = z.object({
  projectId: z.string().min(1),
  disciplineId: z.string().min(1),
  fiscalYear: z.string().optional(), // preferred DUDBC FY to resolve rateCodes against
});

// POST /api/assemblies/[id]/apply
// Creates TakeoffGroups in the target project/discipline from this assembly's group tree.
// Resolves rateCode → rateItemId against published DUDBC rates (latest FY if fiscalYear not given).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const { projectId, disciplineId, fiscalYear } = parsed.data;

    // Tenant guard on target project
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound("Project");
    const user = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    // Load assembly
    const assembly = await prisma.assembly.findUnique({
      where: { id: params.id },
      include: {
        groups: {
          where: { parentId: null },
          include: { children: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!assembly) throw notFound("Assembly");
    if (assembly.orgId && assembly.orgId !== user.orgId) throw forbidden();

    // Verify discipline belongs to project
    const discipline = await prisma.discipline.findFirst({ where: { id: disciplineId, projectId } });
    if (!discipline) return apiError("NOT_FOUND", "Discipline not found on this project.", 404);

    // Build rateCode → rateItemId map from published DUDBC rates
    const targetFY = fiscalYear ?? await getLatestDudbcFY();

    const allCodes = assembly.groups.flatMap(g => [
      g.rateCode,
      ...g.children.map((c: any) => c.rateCode),
    ]).filter(Boolean) as string[];

    const rateMap = new Map<string, string>();
    if (allCodes.length > 0 && targetFY) {
      const rates = await prisma.rateItem.findMany({
        where: { source: "DUDBC", fiscalYear: targetFY, isPublished: true, code: { in: allCodes } },
        select: { id: true, code: true },
      });
      rates.forEach(r => rateMap.set(r.code, r.id));
    }

    // Get max sortOrder in discipline for new groups
    const maxSort = await prisma.takeoffGroup.aggregate({
      where: { projectId, disciplineId },
      _max: { sortOrder: true },
    });
    let sortBase = (maxSort._max.sortOrder ?? -1) + 1;

    // Pre-generate category IDs so children can reference them without sequential round-trips.
    const categoryIds = assembly.groups.map(() => randomUUID());

    const categoryRows = assembly.groups.map((category, i) => ({
      id: categoryIds[i],
      projectId,
      disciplineId,
      parentId: null as string | null,
      name: category.name,
      type: category.type as string,
      colour: category.colour,
      lineWidth: category.lineWidth,
      additionalParams: (category.additionalParams as any) ?? undefined,
      rateItemId: category.rateCode ? rateMap.get(category.rateCode) ?? null : null,
      assemblyId: assembly.id,
      sortOrder: sortBase + i,
    }));

    const childRows = assembly.groups.flatMap((category, i) =>
      (category.children as any[]).map((child: any, ci: number) => ({
        projectId,
        disciplineId,
        parentId: categoryIds[i],
        name: child.name,
        type: child.type as string,
        colour: child.colour,
        lineWidth: child.lineWidth ?? 2,
        additionalParams: child.additionalParams ?? undefined,
        rateItemId: child.rateCode ? rateMap.get(child.rateCode) ?? null : null,
        assemblyId: assembly.id,
        sortOrder: ci,
      }))
    );

    await prisma.$transaction(async (tx) => {
      if (categoryRows.length > 0) await (tx.takeoffGroup.createMany as any)({ data: categoryRows });
      if (childRows.length > 0) await (tx.takeoffGroup.createMany as any)({ data: childRows });
    });

    const created = categoryRows.length + childRows.length;

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "assembly.applied",
      resourceId: projectId,
      meta: { assemblyId: params.id, assemblyName: assembly.name, disciplineId, created } as any,
      ipAddress: ip,
    });

    trackEvent("assembly_applied", { orgId: project.orgId, userId: token.id as string, meta: { assemblyId: params.id, projectId } });
    return NextResponse.json({ applied: assembly.name, created, targetFY: targetFY ?? null });
  } catch (err) {
    return handleApiError(err);
  }
}
