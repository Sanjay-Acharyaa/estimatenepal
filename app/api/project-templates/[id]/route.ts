import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { checkApiRateLimit } from "@/lib/security";

const applySchema = z.object({
  projectId: z.string().min(1),
});

// POST /api/project-templates/[id]/apply — apply template to a project
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    if (!orgId) throw forbidden();

    const tpl = await prisma.projectTemplate.findUnique({ where: { id: params.id } });
    if (!tpl || tpl.orgId !== orgId) throw notFound("Template");

    const body = await req.json();
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project || project.orgId !== orgId) throw notFound("Project");

    const structure = tpl.structure as { disciplines: Array<{ name: string; isPrimary?: boolean; groups: Array<{ name: string; type: string; colour: string; lineWidth: number; rateCode?: string | null; children?: Array<{ name: string; type: string; colour: string; lineWidth: number; rateCode?: string | null }> }> }> };

    // Resolve rate codes to IDs
    const allCodes = structure.disciplines.flatMap(d => d.groups.flatMap(g => [g.rateCode, ...(g.children ?? []).map(c => c.rateCode)])).filter(Boolean) as string[];
    const rateMap = new Map<string, string>();
    if (allCodes.length > 0) {
      const latestFY = await prisma.rateItem.findFirst({ where: { source: "DUDBC", isPublished: true }, orderBy: { fiscalYear: "desc" }, select: { fiscalYear: true } });
      if (latestFY) {
        const rates = await prisma.rateItem.findMany({ where: { code: { in: allCodes }, source: "DUDBC", fiscalYear: latestFY.fiscalYear, isPublished: true }, select: { id: true, code: true } });
        rates.forEach(r => rateMap.set(r.code, r.id));
      }
    }

    let created = 0;
    for (let di = 0; di < structure.disciplines.length; di++) {
      const d = structure.disciplines[di];
      const disc = await prisma.discipline.create({ data: { projectId: project.id, name: d.name, isPrimary: d.isPrimary ?? di === 0, sortOrder: di } });
      let sortOrder = 0;
      for (const g of d.groups) {
        const cat = await prisma.takeoffGroup.create({
          data: { projectId: project.id, disciplineId: disc.id, name: g.name, type: g.type as any, colour: g.colour, lineWidth: g.lineWidth, rateItemId: g.rateCode ? rateMap.get(g.rateCode) ?? null : null, sortOrder: sortOrder++ },
        });
        created++;
        for (const c of g.children ?? []) {
          await prisma.takeoffGroup.create({
            data: { projectId: project.id, disciplineId: disc.id, parentId: cat.id, name: c.name, type: c.type as any, colour: c.colour, lineWidth: c.lineWidth, rateItemId: c.rateCode ? rateMap.get(c.rateCode) ?? null : null, sortOrder: sortOrder++ },
          });
          created++;
        }
      }
    }

    return NextResponse.json({ message: "Template applied.", disciplines: structure.disciplines.length, groups: created });
  } catch (err) { return handleApiError(err); }
}

// DELETE /api/project-templates/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    if (!orgId) throw forbidden();

    const tpl = await prisma.projectTemplate.findUnique({ where: { id: params.id } });
    if (!tpl || tpl.orgId !== orgId) throw notFound("Template");

    await prisma.projectTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ message: "Deleted." });
  } catch (err) { return handleApiError(err); }
}
