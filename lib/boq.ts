import { prisma } from "./prisma";
import { redis } from "./redis";
import { BOQ_CACHE_TTL, BOQ_MAX_CACHE_BYTES } from "./cache-constants";
import { getConversionFactor } from "./unit-conversions";

export interface BOQItem {
  id: string;
  label: string;
  multiplier: number;
  length: number | null;
  breadth: number | null;
  height: number | null;
  quantity: number;
  unit: string;
  siteLocation: string | null;
  measuredDate: Date | null;
  notes: string | null;
}

export interface BOQGroup {
  id: string;
  name: string;
  preamble: string | null;
  type: string;
  categoryName: string | null;
  groupMultiplier: number;
  items: BOQItem[];
  totalQuantity: number;
  unit: string;
  originalQuantity: number;   // raw measured quantity before conversion
  originalUnit: string;       // raw measured unit (e.g. "cu ft")
  conversionFactor: number;   // 1.0 if no conversion was applied
  rate: number;
  amount: number;
  rateItemId: string | null;
  rateCode: string | null;
  rateDescription: string | null;
  isOverridden: boolean;
  originalRate: number | null;
  pendingOverride: {
    id: string;
    proposedValue: string;
    submittedBy: string;
  } | null;
  excludedShapeCount?: number;
}

export interface BOQDiscipline {
  id: string;
  name: string;
  groups: BOQGroup[];
  subtotal: number;
}

export interface BOQDocument {
  project: {
    id: string;
    name: string;
    clientName: string | null;
    clientCompany: string | null;
    district: string | null;
    contingencyPct: number;
    provisionalSum: number;
    vatEnabled: boolean;
    vatRate: number;
    tdsEnabled: boolean;
    tdsRate: number;
    unitSystem: string;
    dateFormat: string;
  };
  disciplines: BOQDiscipline[];
  grandTotal: number;
  contingencyAmount: number;
  provisionalSum: number;
  subtotalAfterAdditions: number;
  vatAmount: number;
  tdsAmount: number;
  finalPayable: number;
  generatedAt: string;
  zeroQuantityItemCount: number;
}

// BOQ_CACHE_TTL and BOQ_MAX_CACHE_BYTES are imported from cache-constants

export async function invalidateBOQCache(projectId: string): Promise<void> {
  redis.del(`boq:v2:${projectId}`).catch((err: unknown) => {
    console.error("[boq] Redis invalidation failed for project", projectId, err);
  });
}

export async function generateBOQ(projectId: string): Promise<BOQDocument> {
  const cacheKey = `boq:v2:${projectId}`;
  try {
    const hit = await redis.get(cacheKey);
    if (hit) {
      return JSON.parse(hit) as BOQDocument;
    }
  } catch {
    // Redis miss or error — proceed to compute
  }

  const boq = await computeBOQ(projectId);
  const serialised = JSON.stringify(boq);
  if (serialised.length <= BOQ_MAX_CACHE_BYTES) {
    redis.set(cacheKey, serialised, "EX", BOQ_CACHE_TTL).catch(() => {});
  }
  return boq;
}

async function computeBOQ(projectId: string): Promise<BOQDocument> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      clientName: true,
      clientCompany: true,
      district: true,
      contingencyPct: true,
      provisionalSum: true,
      vatEnabled: true,
      vatRate: true,
      tdsEnabled: true,
      tdsRate: true,
      unitSystem: true,
      dateFormat: true,
    },
  });
  if (!project) throw new Error("Project not found");

  const disciplines = await prisma.discipline.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  });

  // Only layers (parentId set) hold takeoff items
  // Note: rateItem is fetched separately via rateMap to avoid Prisma client version issues
  const layers = await prisma.takeoffGroup.findMany({
    where: { projectId, parentId: { not: null } },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      parent: { select: { name: true, sortOrder: true } },
    },
    orderBy: [{ parent: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  // Gather rateItemIds from group-level assignments (preferred) and fall back to items
  const rateItemIds = Array.from(
    new Set(
      layers
        .map((g) => g.rateItemId)
        .filter((id): id is string => !!id)
    )
  );

  // Parallelise the three independent lookups after rateItemIds are known.
  // The old RateAnalysis.useComputedRate path is intentionally removed: the resource-based
  // analysis system writes directly to rateItem.baseRate via "Apply to Base Rate", so
  // baseOrDistrictRate always reflects the most recent computed rate.
  const [rateItems, districtRates, approvedOverrides, pendingOverrides] = await Promise.all([
    rateItemIds.length > 0
      ? prisma.rateItem.findMany({ where: { id: { in: rateItemIds } } })
      : Promise.resolve([]),
    project.district
      ? prisma.districtRate.findMany({
          where: { district: project.district },
          select: { rateItemId: true, rate: true },
        })
      : Promise.resolve([]),
    // Fetch all approved overrides (no distinct) so rate and description overrides
    // for the same rateItemId are both applied independently. With distinct + createdAt desc,
    // a description override approved after a rate override would silently displace the rate.
    prisma.bOQOverride.findMany({
      where: { projectId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.bOQOverride.findMany({
      where: { projectId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      distinct: ["rateItemId"],
    }),
  ]);

  const rateMap = new Map(rateItems.map((r) => [r.id, r]));
  const districtRateMap = new Map(districtRates.map((r) => [r.rateItemId, r.rate]));

  // Build separate maps per field so both a rate override and a description override
  // for the same rateItemId are applied independently (first-seen wins per field since
  // overrides are ordered createdAt desc, so first = most recent).
  const approvedRateMap = new Map<string, typeof approvedOverrides[0]>();
  const approvedDescMap = new Map<string, typeof approvedOverrides[0]>();
  for (const ov of approvedOverrides) {
    if (!ov.rateItemId) continue;
    if (ov.field === "rate" && !approvedRateMap.has(ov.rateItemId)) approvedRateMap.set(ov.rateItemId, ov);
    if (ov.field === "description" && !approvedDescMap.has(ov.rateItemId)) approvedDescMap.set(ov.rateItemId, ov);
  }
  const pendingMap = new Map(pendingOverrides.filter(ov => ov.rateItemId != null).map((ov) => [ov.rateItemId, ov]));

  const boqDisciplines: BOQDiscipline[] = [];

  for (const disc of disciplines) {
    const discLayers = layers.filter((g) => g.disciplineId === disc.id);
    const boqGroups: BOQGroup[] = [];

    for (const layer of discLayers) {
      // Use group-level rateItemId (set in TakeoffGroupDetail)
      const rateItemId = layer.rateItemId ?? null;
      const rateItem = rateItemId ? rateMap.get(rateItemId) : undefined;

      const ap = layer.additionalParams as {
        volumeMethod?: string;
        height?: { ft: number; in: number };
        breadth?: { ft: number; in: number };
        wall?: { enabled: boolean; heightFt: number; heightIn: number };
        spacing?: { ft: number; in: number };
      } | null;

      // Compute total from rawQuantity so group.multiplier is never baked into items
      let totalQuantity: number;
      let unit: string;

      const safeNum = (v: unknown): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      let excludedShapeCount = 0;
      // For VOLUME, only include shapes that match the current method in the measurement book.
      // For all other types, use every item.
      let mbItems = layer.items;

      if (layer.type === "VOLUME") {
        const method = ap?.volumeMethod ?? "area_x_h";
        const volumeValidItems = layer.items.filter(i => {
          const isLength = i.shapeType === "POLYLINE" || i.shapeType === "ARC" || !i.shapeType;
          const isArea = i.shapeType === "RECTANGLE" || i.shapeType === "CIRCLE" || i.shapeType === "POLYGON";
          return method === "lbh" ? isLength : isArea;
        });
        mbItems = volumeValidItems;
        excludedShapeCount = layer.items.length - volumeValidItems.length;
        // heights/breadths stored as feet+inches; apply per-item unit conversion so shapes
        // drawn in ft zones and m zones within the same group are each scaled correctly.
        const heightFt = ap?.height != null ? safeNum(ap.height.ft) + safeNum(ap.height.in) / 12 : null;
        const breadthFt = ap?.breadth != null ? safeNum(ap.breadth.ft) + safeNum(ap.breadth.in) / 12 : null;
        let volumeTotal = 0;
        for (const i of volumeValidItems) {
          const raw = safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity);
          const ftToUnit = i.unit.includes("ft") ? 1 : 0.3048;
          const h = heightFt != null ? heightFt * ftToUnit : null;
          if (method === "lbh") {
            const b = breadthFt != null ? breadthFt * ftToUnit : null;
            volumeTotal += raw * (b ?? 1) * (h ?? 1);
          } else {
            volumeTotal += raw * (h ?? 1);
          }
        }
        totalQuantity = volumeTotal * layer.multiplier;
        // Unit display uses first valid item's unit (consistent with how items are drawn)
        const firstUnit = volumeValidItems[0]?.unit ?? layer.items[0]?.unit ?? "ft";
        const isMetric = firstUnit.replace(/ \(set [^)]+\)/g, "").trim().endsWith("m");
        if (method === "lbh") {
          unit = (breadthFt != null && breadthFt > 0) && (heightFt != null && heightFt > 0)
            ? (isMetric ? "cu m" : "cu ft")
            : (isMetric ? "sq m" : "sq ft");
        } else {
          unit = (heightFt != null && heightFt > 0) ? (isMetric ? "cu m" : "cu ft") : (isMetric ? "sq m" : "sq ft");
        }
      } else if (layer.type === "VERTICAL_WALL_AREA") {
        // Per-item unit conversion: wall height stored in ft, convert to each item's scale unit.
        const wallHFt = ap?.wall ? (safeNum(ap.wall.heightFt) + safeNum(ap.wall.heightIn) / 12) : 0;
        let vwaTotal = 0;
        for (const i of layer.items) {
          const raw = safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity);
          const ftToUnit = i.unit.includes("ft") ? 1 : 0.3048;
          vwaTotal += raw * (wallHFt * ftToUnit);
        }
        totalQuantity = wallHFt > 0 ? vwaTotal * layer.multiplier : 0;
        const wallItemUnit = layer.items[0]?.unit ?? "ft";
        unit = wallHFt > 0 ? (wallItemUnit.replace(/ \(set [^)]+\)/g, "").trim().endsWith("m") ? "sq m" : "sq ft") : wallItemUnit;
      } else if (layer.type === "COUNT_BY_DISTANCE") {
        const sp = ap?.spacing;
        const spacingFt = sp ? safeNum(sp.ft) + safeNum(sp.in) / 12 : 0;
        if (spacingFt > 0) {
          const countTotal = layer.items.reduce((s, i) => {
            const raw = safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity);
            const ftu = i.unit.includes("ft") ? 1 : 0.3048;
            const spacing = spacingFt * ftu;
            // Fence-post correction (+1) counts one object at each endpoint of a span.
            // Deduction layers (raw < 0) represent voids/openings; no extra post at the boundary.
            const count = raw >= 0
              ? Math.floor(raw / spacing) + 1
              : Math.ceil(raw / spacing);
            return s + count;
          }, 0);
          totalQuantity = countTotal * layer.multiplier;
          unit = "each";
        } else {
          // Normalise to metres so ft-zone and m-zone items accumulate in the same unit.
          // Items drawn while spacing was set carry an "each|ft" sentinel; .includes("ft")
          // still detects that correctly and applies the ft→m factor.
          const rawTotal = layer.items.reduce((s, i) => {
            const toM = i.unit.includes("ft") ? 0.3048 : 1;
            return s + safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity) * toM;
          }, 0);
          totalQuantity = rawTotal * layer.multiplier;
          unit = "m";
        }
      } else {
        // COUNT, LINEAR, AREA
        const rawTotal = layer.items.reduce((s, i) => s + safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity), 0);
        totalQuantity = rawTotal * layer.multiplier;
        unit = (layer.items[0]?.unit ?? "").replace(/ \(set [^)]+\)/g, "").trim()
          || (layer.type === "COUNT" ? "each" : layer.type === "AREA" ? "sq m" : "m");
      }

      // Attempt unit conversion to match rateItem.unit
      let originalQuantity = totalQuantity;
      const originalUnit = unit;
      let conversionFactor = 1;

      if (rateItem) {
        const factor = getConversionFactor(unit, rateItem.unit);
        if (factor !== null && factor !== 1) {
          conversionFactor = factor;
          totalQuantity = totalQuantity * factor;
          unit = rateItem.unit;
        }
      }

      // Final guard — malformed additionalParams or multiplier can still produce NaN/Infinity
      if (!Number.isFinite(totalQuantity)) totalQuantity = 0;
      if (!Number.isFinite(originalQuantity)) originalQuantity = 0;

      // Prefer district rate over base rate when one is explicitly set (including zero,
      // which means government-supplied / no-cost in this district).
      const districtRate = rateItemId ? districtRateMap.get(rateItemId) : undefined;
      const baseOrDistrictRate = districtRate !== undefined
        ? districtRate
        : (rateItemId ? (rateItem?.baseRate ?? 0) : 0);
      let rate = baseOrDistrictRate ?? 0;
      let isOverridden = false;
      let originalRate: number | null = null;

      let overriddenDescription: string | null = null;

      if (rateItemId) {
        const rateOv = approvedRateMap.get(rateItemId);
        if (rateOv) {
          originalRate = rate;
          const parsedRate = parseFloat(rateOv.approvedValue ?? rateOv.proposedValue);
          if (!Number.isFinite(parsedRate) || parsedRate < 0) {
            rate = districtRateMap.get(rateItemId) ?? rateItem?.baseRate ?? 0;
          } else {
            rate = parsedRate;
          }
          isOverridden = true;
        }
        const descOv = approvedDescMap.get(rateItemId);
        if (descOv) {
          const desc = descOv.approvedValue ?? descOv.proposedValue;
          if (desc) overriddenDescription = desc;
        }
      }

      const pendingOv = rateItemId ? pendingMap.get(rateItemId) : undefined;

      boqGroups.push({
        id: layer.id,
        name: layer.name,
        preamble: layer.preamble,
        type: layer.type,
        categoryName: layer.parent?.name ?? null,
        groupMultiplier: layer.multiplier,
        items: mbItems.map((item) => {
          // Compute per-item L/B/H for measurement book format and recompute quantity
          // from rawQuantity + current group params to avoid stale stored values.
          let mbLength: number | null = null;
          let mbBreadth: number | null = null;
          let mbHeight: number | null = null;
          let effectiveQty: number;
          const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;

          if (layer.type === "VERTICAL_WALL_AREA") {
            const wH_ft = ap?.wall != null
              ? (ap.wall.heightFt ?? 0) + (ap.wall.heightIn ?? 0) / 12
              : null;
            const wFtToUnit = item.unit.includes("ft") ? 1 : 0.3048;
            const wH = wH_ft !== null ? wH_ft * wFtToUnit : null;
            mbLength = item.rawQuantity;
            if (wH !== null && wH > 0) mbHeight = wH;
            effectiveQty = wH !== null ? signedRaw * wH * layer.multiplier : signedRaw * layer.multiplier;
          } else if (layer.type === "VOLUME") {
            const method = ap?.volumeMethod ?? "area_x_h";
            const vFtToUnit = item.unit.includes("ft") ? 1 : 0.3048;
            // null means "dimension not specified" (use factor of 1); 0 means explicitly zero (quantity = 0)
            const h = ap?.height != null
              ? ((ap.height.ft ?? 0) + (ap.height.in ?? 0) / 12) * vFtToUnit
              : null;
            mbLength = item.rawQuantity;
            if (h !== null && h > 0) mbHeight = h;
            if (method === "lbh") {
              const b = ap?.breadth != null
                ? ((ap.breadth.ft ?? 0) + (ap.breadth.in ?? 0) / 12) * vFtToUnit
                : null;
              if (b !== null && b > 0) mbBreadth = b;
              effectiveQty = signedRaw * (b ?? 1) * (h ?? 1) * layer.multiplier;
            } else {
              effectiveQty = signedRaw * (h ?? 1) * layer.multiplier;
            }
          } else if (layer.type === "COUNT_BY_DISTANCE") {
            const sp = ap?.spacing;
            const spacingFt = sp ? safeNum(sp.ft) + safeNum(sp.in) / 12 : 0;
            const cbtFtToUnit = item.unit.includes("ft") ? 1 : 0.3048;
            const spacing = spacingFt * cbtFtToUnit;
            if (spacing > 0) {
              const count = signedRaw >= 0
                ? Math.floor(signedRaw / spacing) + 1
                : Math.ceil(signedRaw / spacing);
              effectiveQty = count * layer.multiplier;
            } else {
              effectiveQty = signedRaw * layer.multiplier;
            }
          } else {
            // COUNT, LINEAR, AREA — recompute from rawQuantity × current group multiplier;
            // item.quantity bakes in the multiplier at draw time and goes stale after a group multiplier change.
            effectiveQty = signedRaw * layer.multiplier;
          }

          return {
            id: item.id,
            label: item.label,
            // For items with dimensions (VERTICAL_WALL_AREA / VOLUME), the qty formula
            // =C*D*F uses the multiplier to carry the sign for deductions. Without this,
            // the formula always produces a positive value and Excel recalculation flips
            // deductions to additions. COUNT/LINEAR/AREA items have no formula so the
            // negative sign lives in effectiveQty directly — their multiplier stays positive.
            multiplier: (item.isNegative && mbLength !== null) ? -layer.multiplier : layer.multiplier,
            length: mbLength,
            breadth: mbBreadth,
            height: mbHeight,
            quantity: effectiveQty,
            unit: item.unit,
            siteLocation: item.siteLocation,
            measuredDate: item.measuredDate,
            notes: item.notes,
          };
        }),
        totalQuantity,
        unit,
        originalQuantity,
        originalUnit,
        conversionFactor,
        rate,
        amount: totalQuantity * rate,
        rateItemId,
        rateCode: rateItem?.code ?? null,
        rateDescription: overriddenDescription ?? rateItem?.description ?? null,
        isOverridden,
        originalRate,
        pendingOverride: pendingOv
          ? {
              id: pendingOv.id,
              proposedValue: pendingOv.proposedValue,
              submittedBy: pendingOv.submittedBy,
            }
          : null,
        excludedShapeCount,
      });
    }

    boqDisciplines.push({
      id: disc.id,
      name: disc.name,
      groups: boqGroups,
      subtotal: boqGroups.reduce((s, g) => s + g.amount, 0),
    });
  }

  const zeroQuantityItemCount = layers.reduce(
    (total, layer) => total + layer.items.filter(i => i.rawQuantity === 0).length,
    0
  );

  const grandTotal = boqDisciplines.reduce((s, d) => s + d.subtotal, 0);
  const contingencyPct = project.contingencyPct ?? 0;
  const contingencyAmount = grandTotal * (contingencyPct / 100);
  const provisionalSum = Math.max(0, project.provisionalSum ?? 0);
  const subtotalAfterAdditions = grandTotal + contingencyAmount + provisionalSum;
  const vatAmount = project.vatEnabled
    ? subtotalAfterAdditions * (project.vatRate / 100)
    : 0;
  const tdsAmount = project.tdsEnabled
    ? subtotalAfterAdditions * (project.tdsRate / 100)
    : 0;

  return {
    project: {
      id: project.id,
      name: project.name,
      clientName: project.clientName,
      clientCompany: project.clientCompany,
      district: project.district,
      contingencyPct,
      provisionalSum,
      vatEnabled: project.vatEnabled,
      vatRate: project.vatRate,
      tdsEnabled: project.tdsEnabled,
      tdsRate: project.tdsRate,
      unitSystem: project.unitSystem,
      dateFormat: project.dateFormat,
    },
    disciplines: boqDisciplines,
    grandTotal,
    contingencyAmount,
    provisionalSum,
    subtotalAfterAdditions,
    vatAmount,
    tdsAmount,
    finalPayable: subtotalAfterAdditions + vatAmount - tdsAmount,
    generatedAt: new Date().toISOString(),
    zeroQuantityItemCount,
  };
}
