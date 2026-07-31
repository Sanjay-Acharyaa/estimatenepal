import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { getConversionFactor } from "@/lib/unit-conversions";
import { computeGroupTotal } from "@/lib/boq";


export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    // Load all groups with rate + items for this project
    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id, disciplineId: { not: null }, parentId: { not: null } },
      select: {
        id: true,
        rateItemId: true,
        disciplineId: true,
        type: true,
        multiplier: true,
        additionalParams: true,
        rateItem: { select: { baseRate: true, unit: true } },
        items: { select: { rawQuantity: true, shapeType: true, isNegative: true, unit: true } },
      },
    });

    // Mirror lib/boq.ts rate-resolution: district rate > base rate; approved override wins
    const rateItemIds = Array.from(new Set(groups.flatMap(g => g.rateItemId ? [g.rateItemId] : [])));
    const [districtRates, approvedOverrides] = await Promise.all([
      project.district && rateItemIds.length > 0
        ? prisma.districtRate.findMany({
            where: { district: project.district, rateItemId: { in: rateItemIds } },
            select: { rateItemId: true, rate: true },
          })
        : Promise.resolve([]),
      rateItemIds.length > 0
        ? prisma.bOQOverride.findMany({
            where: { projectId: params.id, status: "APPROVED", field: "rate" },
            orderBy: { createdAt: "desc" },
            select: { rateItemId: true, field: true, approvedValue: true, proposedValue: true },
          })
        : Promise.resolve([]),
    ]);
    const districtRateMap = new Map(districtRates.map(r => [r.rateItemId, r.rate]));
    // Mirror lib/boq.ts: first-seen wins after ordering by createdAt desc (most recent override).
    // Explicit loop avoids reliance on distinct-with-orderBy behaviour across DB/Prisma versions.
    const approvedMap = new Map<string, typeof approvedOverrides[0]>();
    for (const ov of approvedOverrides) {
      if (ov.rateItemId && !approvedMap.has(ov.rateItemId)) approvedMap.set(ov.rateItemId, ov);
    }

    const totals: Record<string, number> = {};
    // Disciplines that have at least one group with an unrecognised qty→rate unit pair.
    // The client shows a warning icon on those tabs so the estimator knows why a total
    // may look unexpectedly low.
    const unitErrorDisciplines = new Set<string>();

    // CONTRACT: qty values here are POST-MULTIPLIER (g.multiplier is passed to computeGroupTotal).
    // takeoff-groups/totals returns pre-multiplier values — do NOT change one without updating both.
    for (const g of groups) {
      if (!g.disciplineId || !g.rateItem) continue;
      const { qty, unit: qtyUnit } = computeGroupTotal(
        { type: g.type, additionalParams: g.additionalParams as Record<string, unknown> | null, multiplier: g.multiplier },
        g.items,
      );

      // Resolve rate: district rate > base rate, then apply approved override if present
      const rid = g.rateItemId;
      const districtRate = rid ? districtRateMap.get(rid) : undefined;
      const baseOrDistrictRate = districtRate !== undefined
        ? districtRate
        : (g.rateItem.baseRate ?? 0);
      let rate = baseOrDistrictRate;
      if (rid) {
        const ov = approvedMap.get(rid);
        if (ov && ov.field === "rate") {
          const parsedRate = parseFloat(ov.approvedValue ?? ov.proposedValue);
          rate = (Number.isFinite(parsedRate) && parsedRate >= 0) ? parsedRate : baseOrDistrictRate;
        }
      }
      const convFactor = getConversionFactor(qtyUnit, g.rateItem.unit);
      if (convFactor === null) {
        // Unit pair unknown → contribute $0 to the total and flag the discipline so the
        // UI can warn the estimator. This avoids a silently wrong total.
        unitErrorDisciplines.add(g.disciplineId);
        continue;
      }
      const convertedQty = convFactor !== 1 ? qty * convFactor : qty;
      const amount = convertedQty * rate;
      totals[g.disciplineId] = (totals[g.disciplineId] ?? 0) + amount;
    }

    return NextResponse.json({ totals, unitErrorDisciplines: Array.from(unitErrorDisciplines) });
  } catch (err) {
    return handleApiError(err);
  }
}
