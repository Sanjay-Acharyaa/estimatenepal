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
  unlinkedGroupCount: number; // layers that have items but no rate item linked — BOQ contribution is $0
}

// BOQ_CACHE_TTL and BOQ_MAX_CACHE_BYTES are imported from cache-constants

// ─── Shared quantity computation ─────────────────────────────────────────────
// Single implementation of the per-group aggregation formula used by the BOQ
// export, the discipline-cost panel, and the sidebar layer-totals panel.
// All three callers must use this function to stay in sync.

export type ItemForGroupQty = {
  rawQuantity: number;
  isNegative: boolean;
  unit: string;
  shapeType: string | null | undefined;
};

export type GroupForQty = {
  type: string;
  additionalParams: Record<string, unknown> | null | undefined;
  multiplier: number;
};

/**
 * Aggregates rawQuantity values for a group's items into a total qty + unit,
 * applying the group type's formula (fence-post, wall height, volume, etc.).
 * Returns `excludedShapeCount` for VOLUME (shapes excluded due to method mismatch).
 */
export function computeGroupTotal(
  group: GroupForQty,
  items: ItemForGroupQty[],
): { qty: number; unit: string; excludedShapeCount: number } {
  const ap = group.additionalParams as {
    volumeMethod?: string;
    height?: { ft: number; in: number };
    breadth?: { ft: number; in: number };
    wall?: { enabled?: boolean; heightFt: number; heightIn: number };
    spacing?: { ft: number; in: number };
  } | null;

  const safeNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  if (group.type === "VOLUME") {
    const method = ap?.volumeMethod ?? "area_x_h";
    const validItems = items.filter(i => {
      const st = i.shapeType ?? null;
      const isLength = st === "POLYLINE" || st === "ARC";
      const isArea   = st === "RECTANGLE" || st === "CIRCLE" || st === "POLYGON";
      // null shapeType matches neither branch → excluded and counted in excludedShapeCount.
      return method === "lbh" ? isLength : isArea;
    });
    const excludedShapeCount = items.length - validItems.length;
    const heightFt = ap?.height != null ? safeNum(ap.height.ft) + safeNum(ap.height.in) / 12 : null;
    const breadthFt = ap?.breadth != null ? safeNum(ap.breadth.ft) + safeNum(ap.breadth.in) / 12 : null;
    let total = 0;
    for (const i of validItems) {
      const raw = safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity);
      const ftToUnit = i.unit.includes("ft") ? 1 : 0.3048;
      const h = heightFt != null ? heightFt * ftToUnit : null;
      if (method === "lbh") {
        const b = breadthFt != null ? breadthFt * ftToUnit : null;
        total += raw * (b ?? 1) * (h ?? 1);
      } else {
        total += raw * (h ?? 1);
      }
    }
    const qty = total * group.multiplier;
    const firstUnit = validItems[0]?.unit ?? items[0]?.unit ?? "ft";
    const isMetric = firstUnit.replace(/ \(set [^)]+\)/g, "").trim().endsWith("m");
    let unit: string;
    if (method === "lbh") {
      unit = (breadthFt != null && breadthFt > 0) && (heightFt != null && heightFt > 0)
        ? (isMetric ? "cu m" : "cu ft")
        : (isMetric ? "sq m" : "sq ft");
    } else {
      unit = (heightFt != null && heightFt > 0) ? (isMetric ? "cu m" : "cu ft") : (isMetric ? "sq m" : "sq ft");
    }
    return { qty, unit, excludedShapeCount };
  }

  if (group.type === "VERTICAL_WALL_AREA") {
    const wallHFt = ap?.wall ? safeNum(ap.wall.heightFt) + safeNum(ap.wall.heightIn) / 12 : 0;
    // Normalise every perimeter item to metres before summing so mixed ft+m scale-zone
    // groups accumulate in one consistent unit (avoids sq-ft + sq-m dimension mismatch).
    let perimM = 0;
    for (const i of items) {
      const raw = safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity);
      const toM = i.unit.includes("ft") ? 0.3048 : 1;
      perimM += raw * toM;
    }
    const wallHM = wallHFt * 0.3048;
    const qty = wallHFt > 0 ? perimM * wallHM * group.multiplier : 0;
    const unit = wallHFt > 0 ? "sq m" : "m (set wall height)";
    return { qty, unit, excludedShapeCount: 0 };
  }

  if (group.type === "COUNT_BY_DISTANCE") {
    const sp = ap?.spacing;
    const spacingFt = sp ? safeNum(sp.ft) + safeNum(sp.in) / 12 : 0;
    if (spacingFt > 0) {
      let countTotal = 0;
      for (const i of items) {
        const raw = safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity);
        const ftu = i.unit.includes("ft") ? 1 : 0.3048;
        const spacing = spacingFt * ftu;
        const closedShape = i.shapeType === "RECTANGLE" || i.shapeType === "POLYGON" || i.shapeType === "CIRCLE";
        const absRaw = Math.abs(raw);
        const cnt = Math.ceil(absRaw / spacing - 1e-9) + (closedShape ? 0 : 1);
        const count = raw >= 0 ? cnt : -cnt;
        countTotal += count;
      }
      return { qty: countTotal * group.multiplier, unit: "each", excludedShapeCount: 0 };
    } else {
      // Normalise to metres so ft-zone and m-zone items accumulate in the same unit.
      let rawTotal = 0;
      for (const i of items) {
        const toM = i.unit.includes("ft") ? 0.3048 : 1;
        rawTotal += safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity) * toM;
      }
      return { qty: rawTotal * group.multiplier, unit: "m", excludedShapeCount: 0 };
    }
  }

  // COUNT, LINEAR, AREA
  // Use .includes("ft") on item.unit to detect imperial scale — this is reliable even when
  // item.unit is stale after a group type change (e.g. "ft" on an AREA group still correctly
  // signals imperial; the full label is wrong but the ft-detector is not).
  // Derive the display unit from group.type + the imperial flag so a stale stored unit
  // ("ft" instead of "sq ft" after LINEAR→AREA type change) never leaks into the BOQ total.
  const isImperial = items.some(i => i.unit.includes("ft"));
  // Mixed-scale zones: some items in ft, some in m — need normalisation to metric.
  const hasMixedScale = isImperial && items.some(i => !i.unit.includes("ft"));

  // Conversion factor to metric for a single item — driven by group.type so that an AREA
  // group always uses 0.3048² even if item.unit is stale "ft" (linear) rather than "sq ft".
  const toMetricFactor = (iFt: boolean): number => {
    if (!iFt) return 1;
    if (group.type === "AREA") return 0.3048 * 0.3048;  // sq ft → sq m
    return 0.3048;                                        // ft → m  (LINEAR; COUNT never needs this)
  };

  let rawTotal: number;
  let unit: string;

  if (hasMixedScale) {
    rawTotal = items.reduce((s, i) => {
      const iFt = i.unit.includes("ft");
      return s + safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity) * toMetricFactor(iFt);
    }, 0);
    unit = group.type === "COUNT" ? "each"
         : group.type === "AREA"  ? "sq m"
         :                          "m";
  } else {
    rawTotal = items.reduce((s, i) => s + safeNum(i.isNegative ? -i.rawQuantity : i.rawQuantity), 0);
    unit = group.type === "COUNT" ? "each"
         : group.type === "AREA"  ? (isImperial ? "sq ft" : "sq m")
         :                          (isImperial ? "ft"    : "m");
  }
  return { qty: rawTotal * group.multiplier, unit, excludedShapeCount: 0 };
}

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
      // Stamp generatedAt at serve time so it reflects when the BOQ was actually returned,
      // not when the cached payload was originally built.
      return { ...JSON.parse(hit) as BOQDocument, generatedAt: new Date().toISOString() };
    }
  } catch {
    // Redis miss or error — proceed to compute
  }

  const boq = await computeBOQ(projectId);
  // Exclude generatedAt from the cached blob so the timestamp reflects serve time, not cache-build time.
  const { generatedAt: _g, ...cacheable } = boq;
  const serialised = JSON.stringify(cacheable);
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
    where: { projectId, parentId: { not: null }, disciplineId: { not: null } },
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

      // ap is still needed below for per-item MB dimension computation.
      const ap = layer.additionalParams as {
        volumeMethod?: string;
        height?: { ft: number; in: number };
        breadth?: { ft: number; in: number };
        wall?: { enabled: boolean; heightFt: number; heightIn: number };
        spacing?: { ft: number; in: number };
      } | null;

      const safeNum = (v: unknown): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      // Use the shared helper so BOQ, discipline totals, and sidebar totals all
      // apply exactly the same formula. No inline formula duplication here.
      let { qty: totalQuantity, unit, excludedShapeCount } = computeGroupTotal(
        { type: layer.type, additionalParams: layer.additionalParams as Record<string, unknown> | null, multiplier: layer.multiplier },
        layer.items,
      );

      // mbItems drives the measurement-book rows. For VOLUME, only shapes that
      // match the current method appear; for all other types every item appears.
      const mbItems = layer.type === "VOLUME"
        ? (() => {
            const method = ap?.volumeMethod ?? "area_x_h";
            return layer.items.filter(i => {
              const isLength = i.shapeType === "POLYLINE" || i.shapeType === "ARC";
              const isArea = i.shapeType === "RECTANGLE" || i.shapeType === "CIRCLE" || i.shapeType === "POLYGON";
              return method === "lbh" ? isLength : isArea;
            });
          })()
        : layer.items;

      // Attempt unit conversion to match rateItem.unit
      let originalQuantity = totalQuantity;
      const originalUnit = unit;
      let conversionFactor = 1;

      if (rateItem) {
        const factor = getConversionFactor(unit, rateItem.unit);
        if (factor === null) {
          // Unit pair unknown — zeroing the quantity makes the line visibly wrong (zero amount)
          // rather than silently wrong (unconverted qty × mismatched rate unit).
          totalQuantity = 0;
          originalQuantity = 0;
        } else if (factor !== 1) {
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
          let mbUnit = item.unit; // overridden per branch when the stored unit is not the output unit
          const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;

          if (layer.type === "VERTICAL_WALL_AREA") {
            const wH_ft = ap?.wall != null
              ? (ap.wall.heightFt ?? 0) + (ap.wall.heightIn ?? 0) / 12
              : null;
            // Normalise perimeter and wall height to metres so MB row matches computeGroupTotal (H-01).
            const toM = item.unit.includes("ft") ? 0.3048 : 1;
            const wHM = wH_ft !== null ? wH_ft * 0.3048 : null;
            mbLength = item.rawQuantity * toM; // unsigned perimeter in metres for L column
            if (wHM !== null && wHM > 0) mbHeight = wHM;
            // signedRaw carries deduction sign; MB multiplier sign is flipped at line 519
            effectiveQty = wHM !== null ? signedRaw * toM * wHM * layer.multiplier : signedRaw * toM * layer.multiplier;
            mbUnit = wHM !== null && wHM > 0 ? "sq m" : "m (set wall height)";
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
                : -(Math.floor(Math.abs(signedRaw) / spacing) + 1);
              effectiveQty = count * layer.multiplier;
            } else {
              effectiveQty = signedRaw * layer.multiplier;
            }
            // Strip the "each|ft" scale sentinel — display unit is always "each".
            mbUnit = "each";
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
            unit: mbUnit,
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

  // Only count items from discipline-assigned layers — those are the ones that appear in
  // the BOQ output. Layers without a disciplineId are not exported and should not inflate this count.
  const disciplineLayers = layers.filter(layer => layer.disciplineId !== null);
  const zeroQuantityItemCount = disciplineLayers
    .reduce((total, layer) => total + layer.items.filter(i => i.rawQuantity === 0).length, 0);
  // Layers with items but no rate link contribute $0 to the BOQ — flag them so the UI can warn.
  const unlinkedGroupCount = disciplineLayers
    .filter(layer => !layer.rateItemId && layer.items.length > 0).length;

  const grandTotal = boqDisciplines.reduce((s, d) => s + d.subtotal, 0);
  const contingencyPct = project.contingencyPct ?? 0;
  const contingencyAmount = grandTotal * (contingencyPct / 100);
  const provisionalSum = Math.max(0, project.provisionalSum ?? 0);
  const subtotalAfterAdditions = grandTotal + contingencyAmount + provisionalSum;
  const vatAmount = project.vatEnabled
    ? subtotalAfterAdditions * (project.vatRate / 100)
    : 0;
  // TDS is applied to the PRE-VAT subtotal (subtotalAfterAdditions), matching Nepal
  // Income Tax Act practice for government contracts (TDS withheld on contract value
  // before VAT). Some private/donor contracts apply TDS on the post-VAT total instead;
  // if that is required, change the base to (subtotalAfterAdditions + vatAmount).
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
    unlinkedGroupCount,
  };
}
