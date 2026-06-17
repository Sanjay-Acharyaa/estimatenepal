import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withTenantGuard } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).max(150).trim(),
  description: z.string().max(1000).trim().optional(),
  category: z.string().max(100).trim().optional(),
  groupIds: z.array(z.string()).min(1, "Select at least one group."),
});

// POST /api/projects/[id]/assemblies/save
// Saves selected TakeoffGroups (categories + their layers) as a new org Assembly.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const user = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const { name, description, category, groupIds } = parsed.data;

    // Load the selected groups (categories) with their children
    const groups = await prisma.takeoffGroup.findMany({
      where: { id: { in: groupIds }, projectId: params.id },
      include: { children: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });

    if (groups.length === 0) return apiError("NOT_FOUND", "None of the selected groups belong to this project.", 404);

    // Lookup rate codes for linked rateItems
    const rateItemIds = [
      ...groups.map(g => g.rateItemId),
      ...groups.flatMap(g => g.children.map((c: any) => c.rateItemId)),
    ].filter(Boolean) as string[];

    const rateItems = await prisma.rateItem.findMany({
      where: { id: { in: rateItemIds } },
      select: { id: true, code: true },
    });
    const rateCodeMap = new Map(rateItems.map(r => [r.id, r.code]));

    const assembly = await prisma.assembly.create({
      data: {
        name,
        description,
        category,
        orgId: user.orgId,
        isPublic: false,
        createdById: token.id as string,
      },
    });

    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      const parent = await prisma.assemblyGroup.create({
        data: {
          assemblyId: assembly.id,
          parentId: null,
          name: grp.name,
          type: grp.type,
          colour: grp.colour,
          lineWidth: grp.lineWidth,
          additionalParams: grp.additionalParams as any ?? undefined,
          rateCode: grp.rateItemId ? rateCodeMap.get(grp.rateItemId) ?? null : null,
          sortOrder: gi,
        },
      });

      // Batch-create all children for this parent in one query
      if (grp.children.length > 0) {
        await prisma.assemblyGroup.createMany({
          data: grp.children.map((child: any, ci: number) => ({
            assemblyId: assembly.id,
            parentId: parent.id,
            name: child.name,
            type: child.type,
            colour: child.colour,
            lineWidth: child.lineWidth,
            additionalParams: child.additionalParams as any ?? undefined,
            rateCode: child.rateItemId ? rateCodeMap.get(child.rateItemId) ?? null : null,
            sortOrder: ci,
          })),
        });
      }
    }

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "assembly.saved_from_project",
      resourceId: assembly.id,
      meta: { projectId: params.id, assemblyName: name, groupCount: groups.length } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ id: assembly.id, name }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
