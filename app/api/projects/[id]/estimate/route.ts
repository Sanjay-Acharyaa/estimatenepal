import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { generateBOQ } from "@/lib/boq";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { computeEstimateLine } from "@/lib/estimate-formula";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const orgId = project.orgId;
    const [boq, overrides] = await Promise.all([
      generateBOQ(params.id),
      prisma.estimateLineOverride.findMany({
        where: { projectId: params.id, orgId },
        select: { groupId: true, wastePct: true, markupPct: true, notes: true },
      }),
    ]);

    const overrideMap = new Map(overrides.map((o) => [o.groupId, o]));
    const vatRate = boq.project.vatEnabled ? boq.project.vatRate : 0;

    const enrichedDisciplines = boq.disciplines.map((disc) => {
      const groups = disc.groups.map((g) => {
        const ov = overrideMap.get(g.id);
        const wastePct = ov?.wastePct ?? 0;
        const markupPct = ov?.markupPct ?? 0;
        const notes = ov?.notes ?? null;

        const computed = computeEstimateLine(g.totalQuantity, g.rate, wastePct, markupPct, vatRate);

        return {
          id: g.id,
          name: g.name,
          unit: g.unit,
          totalQuantity: g.totalQuantity,
          rate: g.rate,
          baseAmount: g.amount,
          rateCode: g.rateCode,
          rateDescription: g.rateDescription,
          isOverridden: g.isOverridden,
          wastePct,
          markupPct,
          notes,
          ...computed,
        };
      });

      return {
        id: disc.id,
        name: disc.name,
        groups,
      };
    });

    return NextResponse.json({
      project: boq.project,
      vatRate,
      disciplines: enrichedDisciplines,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
