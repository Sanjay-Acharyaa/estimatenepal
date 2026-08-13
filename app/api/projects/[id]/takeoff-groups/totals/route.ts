import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { computeGroupTotal } from "@/lib/boq";

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

    // Fetch all groups (need type + additionalParams for formula filtering)
    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id },
      select: { id: true, type: true, additionalParams: true },
    });

    const groupMap = new Map(groups.map(g => [g.id, g]));
    const totals: Record<string, { rawQty: number; unit: string; count: number }> = {};

    // ── Simple groups (LINEAR, AREA, COUNT, VERTICAL_WALL_AREA) ─────────────
    // Use database-level aggregation to avoid loading all item rows into memory.
    // Group by (groupId, unit) so we can detect and normalise mixed-unit groups.
    const simpleGroupIds = groups
      .filter(g => g.type !== "VOLUME" && g.type !== "COUNT_BY_DISTANCE")
      .map(g => g.id);

    if (simpleGroupIds.length > 0) {
      const [posAgg, negAgg] = await Promise.all([
        prisma.takeoffItem.groupBy({
          by: ["groupId", "unit"],
          where: { groupId: { in: simpleGroupIds }, isNegative: false },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          _sum: { rawQuantity: true } as any,
          _count: { id: true },
        }),
        prisma.takeoffItem.groupBy({
          by: ["groupId", "unit"],
          where: { groupId: { in: simpleGroupIds }, isNegative: true },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          _sum: { rawQuantity: true } as any,
          _count: { id: true },
        }),
      ]);

      // Conversion factor to a canonical unit (metric) for each raw unit.
      // COUNT / dimensionless units return factor 1 and keep their unit.
      const toMetric = (unit: string): { factor: number; canonicalUnit: string } => {
        const base = unit.replace(/\s*\(.*\)$/, "").trim();
        if (base === "ft" || base === "Rm." || base === "rm" || base === "lft" || base === "rft" || base === "rmt")
          return { factor: 0.3048, canonicalUnit: "m" };
        if (base === "sqft" || base === "sq ft" || base === "sft")
          return { factor: 0.3048 * 0.3048, canonicalUnit: "sq m" };
        if (base === "cu ft" || base === "cuft" || base === "cft")
          return { factor: 0.3048 ** 3, canonicalUnit: "cu m" };
        return { factor: 1, canonicalUnit: unit };
      };

      // Accumulate per-group totals, normalising to metric when a group has mixed units.
      type GroupAccum = { rawQty: number; unit: string; count: number; units: Set<string> };
      const accum = new Map<string, GroupAccum>();

      const addToAccum = (gid: string, unit: string, signedSum: number, count: number) => {
        if (!accum.has(gid)) accum.set(gid, { rawQty: 0, unit, count: 0, units: new Set() });
        const a = accum.get(gid)!;
        a.units.add(unit);
        a.count += count;
        if (a.units.size > 1) {
          // Mixed units detected: re-normalise existing total and add new bucket in metric.
          const prevMetric = toMetric(a.unit);
          const newMetric = toMetric(unit);
          a.rawQty = a.rawQty * prevMetric.factor + signedSum * newMetric.factor;
          a.unit = newMetric.canonicalUnit;
        } else {
          a.rawQty += signedSum;
          a.unit = unit;
        }
      };

      for (const row of posAgg) {
        const gid = row.groupId as string;
        const sum = getNum((row as any)._sum?.rawQuantity);
        const count = (row._count as any).id ?? 0;
        addToAccum(gid, row.unit, sum, count);
      }
      for (const row of negAgg) {
        const gid = row.groupId as string;
        const sum = getNum((row as any)._sum?.rawQuantity);
        const count = (row._count as any).id ?? 0;
        addToAccum(gid, row.unit, -sum, count);
      }

      accum.forEach((a, gid) => {
        totals[gid] = { rawQty: a.rawQty, unit: a.unit, count: a.count };
      });
    }

    // ── Complex groups (VOLUME, COUNT_BY_DISTANCE) ───────────────────────────
    // These need per-item shapeType for filtering, so rows are loaded — but only
    // for the subset of groups that require it (typically much fewer than all items).
    const complexGroupIds = groups
      .filter(g => g.type === "VOLUME" || g.type === "COUNT_BY_DISTANCE")
      .map(g => g.id);

    if (complexGroupIds.length > 0) {
      const complexItems = await prisma.takeoffItem.findMany({
        where: { groupId: { in: complexGroupIds } },
        select: { groupId: true, rawQuantity: true, unit: true, shapeType: true, isNegative: true },
      });

      // Group items by groupId so the shared helper runs once per group.
      const itemsByGroup = new Map<string, Array<{ rawQuantity: number; unit: string; shapeType: string | null; isNegative: boolean }>>();
      for (const item of complexItems) {
        if (!item.groupId) continue;
        if (!itemsByGroup.has(item.groupId)) itemsByGroup.set(item.groupId, []);
        itemsByGroup.get(item.groupId)!.push(item);
      }

      for (const [gid, items] of Array.from(itemsByGroup)) {
        const grp = groupMap.get(gid);
        if (!grp) continue;
        // Multiplier is applied by the caller (panel/sidebar), not here.
        const { qty: rawQty, unit } = computeGroupTotal(
          { type: grp.type, additionalParams: grp.additionalParams as Record<string, unknown> | null, multiplier: 1 },
          items,
        );
        totals[gid] = { rawQty, unit, count: items.length };
      }
    }

    // CONTRACT: every rawQty in this response is PRE-MULTIPLIER (group.multiplier = 1).
    // Callers (TakeoffPanel sidebar, allPageGroupTotals) must apply group.multiplier themselves.
    // disciplines/totals applies multiplier server-side — do NOT change one without updating both.
    return NextResponse.json(totals);
  } catch (err) {
    return handleApiError(err);
  }
}