import { prisma } from "./prisma";
import { redis } from "./redis";

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
  vatAmount: number;
  tdsAmount: number;
  finalPayable: number;
  generatedAt: string;
}

const BOQ_CACHE_TTL = 30; // seconds — short enough to feel live, long enough to batch export calls

export async function invalidateBOQCache(projectId: string): Promise<void> {
  redis.del(`boq:${projectId}`).catch(() => {});
}

export async function generateBOQ(projectId: string): Promise<BOQDocument> {
  const cacheKey = `boq:${projectId}`;
  try {
    const hit = await redis.get(cacheKey);
    if (hit) return JSON.parse(hit) as BOQDocument;
  } catch {
    // Redis miss or error — proceed to compute
  }

  const boq = await computeBOQ(projectId);
  redis.set(cacheKey, JSON.stringify(boq), "EX", BOQ_CACHE_TTL).catch(() => {});
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
      parent: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Gather rateItemIds from group-level assignments (preferred) and fall back to items
  const rateItemIds = Array.from(
    new Set(
      layers
        .map((g) => g.rateItemId)
        .filter((id): id is string => !!id)
    )
  );

  const rateItems =
    rateItemIds.length > 0
      ? await prisma.rateItem.findMany({ where: { id: { in: rateItemIds } } })
      : [];
  const rateMap = new Map(rateItems.map((r) => [r.id, r]));

  // Load rate analyses so we can use computedRate when useComputedRate=true
  const rateAnalyses = rateItemIds.length > 0
    ? await prisma.rateAnalysis.findMany({
        where: { projectId, rateItemId: { in: rateItemIds } },
      })
    : [];
  const analysisMap = new Map(rateAnalyses.map((a) => [a.rateItemId, a]));

  const allOverrides = await prisma.bOQOverride.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  // Most-recent approved and pending override per rateItemId
  const approvedMap = new Map<string, (typeof allOverrides)[0]>();
  const pendingMap = new Map<string, (typeof allOverrides)[0]>();
  for (const ov of allOverrides) {
    if (ov.status === "APPROVED" && !approvedMap.has(ov.rateItemId)) {
      approvedMap.set(ov.rateItemId, ov);
    }
    if (ov.status === "PENDING" && !pendingMap.has(ov.rateItemId)) {
      pendingMap.set(ov.rateItemId, ov);
    }
  }

  const boqDisciplines: BOQDiscipline[] = [];

  for (const disc of disciplines) {
    const discLayers = layers.filter((g) => g.disciplineId === disc.id);
    const boqGroups: BOQGroup[] = [];

    for (const layer of discLayers) {
      // Use group-level rateItemId (set in TakeoffGroupDetail)
      const rateItemId = layer.rateItemId ?? null;
      const rateItem = rateItemId ? rateMap.get(rateItemId) : undefined;

      // Negative items (voids) reduce the quantity
      const itemsTotal = layer.items.reduce(
        (s, i) => s + (i.isNegative ? -i.quantity : i.quantity),
        0
      );
      const totalQuantity = itemsTotal * layer.multiplier;
      const unit = layer.items[0]?.unit ?? "";

      // Start with base rate; upgrade to computed rate if analysis says so
      const analysis = rateItemId ? analysisMap.get(rateItemId) : undefined;
      let rate = (analysis?.useComputedRate ? analysis.computedRate : rateItem?.baseRate) ?? 0;
      let isOverridden = false;
      let originalRate: number | null = null;

      if (rateItemId) {
        const ov = approvedMap.get(rateItemId);
        if (ov && ov.field === "rate") {
          originalRate = rate;
          rate = parseFloat(ov.approvedValue ?? ov.proposedValue);
          isOverridden = true;
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
        items: layer.items.map((item) => ({
          id: item.id,
          label: item.label,
          multiplier: item.multiplier,
          length: item.length,
          breadth: item.breadth,
          height: item.height,
          quantity: item.isNegative ? -item.quantity : item.quantity,
          unit: item.unit,
          siteLocation: item.siteLocation,
          measuredDate: item.measuredDate,
          notes: item.notes,
        })),
        totalQuantity,
        unit,
        rate,
        amount: totalQuantity * rate,
        rateItemId,
        rateCode: rateItem?.code ?? null,
        rateDescription: rateItem?.description ?? null,
        isOverridden,
        originalRate,
        pendingOverride: pendingOv
          ? {
              id: pendingOv.id,
              proposedValue: pendingOv.proposedValue,
              submittedBy: pendingOv.submittedBy,
            }
          : null,
      });
    }

    boqDisciplines.push({
      id: disc.id,
      name: disc.name,
      groups: boqGroups,
      subtotal: boqGroups.reduce((s, g) => s + g.amount, 0),
    });
  }

  const grandTotal = boqDisciplines.reduce((s, d) => s + d.subtotal, 0);
  const contingencyPct = project.contingencyPct ?? 0;
  const contingencyAmount = grandTotal * (contingencyPct / 100);
  const provisionalSum = project.provisionalSum ?? 0;
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
    vatAmount,
    tdsAmount,
    finalPayable: subtotalAfterAdditions + vatAmount - tdsAmount,
    generatedAt: new Date().toISOString(),
  };
}
