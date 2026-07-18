import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { generateBOQ } from "@/lib/boq";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

function computeLineValues(
  totalQuantity: number,
  rate: number,
  wastePct: number,
  markupPct: number,
  vatRate: number
) {
  const itemCost = totalQuantity * rate * (1 + wastePct / 100);
  // Guard against markup >= 100%
  const safeMkp = Math.min(markupPct, 99.99);
  const saleRate = safeMkp >= 100 ? rate : (rate * (1 + wastePct / 100)) / (1 - safeMkp / 100);
  const totalSale = totalQuantity * saleRate;
  const vatAmount = totalSale * (vatRate / 100);
  const totalWithVat = totalSale + vatAmount;
  return { itemCost, saleRate, totalSale, vatAmount, totalWithVat };
}

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

    const [boq, overrides] = await Promise.all([
      generateBOQ(params.id),
      prisma.estimateLineOverride.findMany({
        where: { projectId: params.id },
        select: { groupId: true, wastePct: true, markupPct: true, notes: true },
      }),
    ]);

    const overrideMap = new Map(overrides.map((o) => [o.groupId, o]));
    const vatRate = boq.project.vatEnabled ? boq.project.vatRate : 0;

    const enrichedDisciplines = boq.disciplines.map((disc) => {
      let discTotalSale = 0;
      let discTotalWithVat = 0;

      const groups = disc.groups.map((g) => {
        const ov = overrideMap.get(g.id);
        const wastePct = ov?.wastePct ?? 0;
        const markupPct = ov?.markupPct ?? 0;
        const notes = ov?.notes ?? null;

        const computed = computeLineValues(g.totalQuantity, g.rate, wastePct, markupPct, vatRate);
        discTotalSale += computed.totalSale;
        discTotalWithVat += computed.totalWithVat;

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
        subtotalSale: discTotalSale,
        subtotalWithVat: discTotalWithVat,
      };
    });

    const grandTotalSale = enrichedDisciplines.reduce((s, d) => s + d.subtotalSale, 0);
    const grandTotalWithVat = enrichedDisciplines.reduce((s, d) => s + d.subtotalWithVat, 0);

    return NextResponse.json({
      project: boq.project,
      vatRate,
      disciplines: enrichedDisciplines,
      grandTotalSale,
      grandTotalWithVat,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
