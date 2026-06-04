export interface RateAnalysisInput {
  materialCost: number;
  skilledLabour: number;
  semiSkilledLabour: number;
  unskilledLabour: number;
  equipmentCost: number;
  overheadPct: number;
  profitPct: number;
  wastagePct: number;
}

export interface RateAnalysisBreakdown {
  materialWithWastage: number;
  totalLabour: number;
  equipmentCost: number;
  baseTotal: number;
  overheadAmount: number;
  profitAmount: number;
  computedRate: number;
}

export function computeCompositeRate(input: RateAnalysisInput): RateAnalysisBreakdown {
  const materialWithWastage = input.materialCost * (1 + input.wastagePct / 100);
  const totalLabour = input.skilledLabour + input.semiSkilledLabour + input.unskilledLabour;
  const baseTotal = materialWithWastage + totalLabour + input.equipmentCost;
  const overheadAmount = baseTotal * (input.overheadPct / 100);
  const afterOverhead = baseTotal + overheadAmount;
  const profitAmount = afterOverhead * (input.profitPct / 100);
  const computedRate = afterOverhead + profitAmount;

  return {
    materialWithWastage,
    totalLabour,
    equipmentCost: input.equipmentCost,
    baseTotal,
    overheadAmount,
    profitAmount,
    computedRate,
  };
}
