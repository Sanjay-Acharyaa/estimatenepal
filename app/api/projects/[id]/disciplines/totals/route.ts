import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { getConversionFactor } from "@/lib/unit-conversions";

function getNum(v: unknown): number {
  const n = Number(v); return Number.isFinite(n) ? n : 0;
}


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
            distinct: ["rateItemId"],
            select: { rateItemId: true, field: true, approvedValue: true, proposedValue: true },
          })
        : Promise.resolve([]),
    ]);
    const districtRateMap = new Map(districtRates.map(r => [r.rateItemId, r.rate]));
    const approvedMap = new Map(approvedOverrides.map(ov => [ov.rateItemId, ov]));

    const totals: Record<string, number> = {};

    for (const g of groups) {
      if (!g.disciplineId || !g.rateItem) continue;
      const ap = g.additionalParams as Record<string, unknown> | null;
      const method = (ap?.volumeMethod as string) ?? "area_x_h";

      // For dimension-multiplied types (COUNT_BY_DISTANCE, VERTICAL_WALL_AREA, VOLUME),
      // apply per-item unit detection so mixed-unit groups (items from ft and m zones)
      // convert the stored ft-based parameters correctly for each item.
      // COUNT/LINEAR/AREA need only the aggregate rawSum (no dimension conversion).
      let qty: number;
      let qtyUnit = "each";

      if (g.type === "COUNT_BY_DISTANCE") {
        const spacingFt = getNum((ap?.spacing as any)?.ft) + getNum((ap?.spacing as any)?.in) / 12;
        let total = 0;
        for (const item of g.items) {
          const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;
          const ftu = item.unit.includes("ft") ? 1 : 0.3048;
          const spacing = spacingFt * ftu;
          if (spacing > 0) {
            const count = signedRaw >= 0 ? Math.floor(signedRaw / spacing) + 1 : Math.ceil(signedRaw / spacing);
            total += count * g.multiplier;
          } else {
            // Normalise to metres so ft-zone and m-zone items accumulate in the same unit.
            const toM = item.unit.includes("ft") ? 0.3048 : 1;
            total += signedRaw * toM * g.multiplier;
          }
        }
        qty = total;
        // Derive the base length unit from the item's stored unit rather than using it
        // verbatim — items drawn when spacing was set carry an "each"/"each|ft" sentinel
        // that must not leak into unit-conversion when spacing is later removed.
        // In the no-spacing case, values are normalised to metres, so qtyUnit is always "m".
        qtyUnit = spacingFt > 0 ? "each" : "m";
      } else if (g.type === "VERTICAL_WALL_AREA") {
        const wallHFt = getNum((ap?.wall as any)?.heightFt) + getNum((ap?.wall as any)?.heightIn) / 12;
        let total = 0;
        for (const item of g.items) {
          const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;
          const ftu = item.unit.includes("ft") ? 1 : 0.3048;
          total += signedRaw * (wallHFt * ftu) * g.multiplier;
        }
        qty = total;
        const firstVwaUnit = g.items[0]?.unit ?? "m";
        qtyUnit = firstVwaUnit.includes("ft") ? "sq ft" : "sq m";
      } else if (g.type === "VOLUME") {
        const heightFt = getNum((ap?.height as any)?.ft) + getNum((ap?.height as any)?.in) / 12;
        const breadthFt = getNum((ap?.breadth as any)?.ft) + getNum((ap?.breadth as any)?.in) / 12;
        let total = 0;
        for (const item of g.items) {
          const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;
          const isLength = item.shapeType === "POLYLINE" || item.shapeType === "ARC" || item.shapeType === null;
          const isArea = item.shapeType === "RECTANGLE" || item.shapeType === "CIRCLE" || item.shapeType === "POLYGON";
          if (!((method === "lbh" && isLength) || (method !== "lbh" && isArea))) continue;
          const ftu = item.unit.includes("ft") ? 1 : 0.3048;
          const h = heightFt * ftu;
          const b = method === "lbh" ? breadthFt * ftu : 1;
          total += signedRaw * h * b * g.multiplier;
        }
        qty = total;
        const firstVolUnit = g.items[0]?.unit ?? "m";
        const isMetric = firstVolUnit.replace(/ \(set [^)]+\)/g, "").trim().endsWith("m");
        const hasVolDim = (method === "lbh" && breadthFt > 0 && heightFt > 0) || (method !== "lbh" && heightFt > 0);
        qtyUnit = hasVolDim ? (isMetric ? "cu m" : "cu ft") : (isMetric ? "sq m" : "sq ft");
      } else {
        // COUNT, LINEAR, AREA — aggregate is correct (no ft-based dimension conversion needed)
        let rawSum = 0;
        for (const item of g.items) {
          rawSum += item.isNegative ? -item.rawQuantity : item.rawQuantity;
        }
        qty = rawSum * g.multiplier;
        qtyUnit = g.items[0]?.unit ?? "each";
      }

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
      const convertedQty = (convFactor !== null && convFactor !== 1) ? qty * convFactor : qty;
      const amount = convertedQty * rate;
      totals[g.disciplineId] = (totals[g.disciplineId] ?? 0) + amount;
    }

    return NextResponse.json(totals);
  } catch (err) {
    return handleApiError(err);
  }
}
