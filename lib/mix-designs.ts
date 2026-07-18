// DUDBC standard mix proportions and calculated material quantities per cum of finished work.
// Dry volume factor: mortar = 1.30, concrete = 1.54 (configurable per org in OrgRateSettings).
// These are the fixed nominal mix ratios; actual material quantities are computed at runtime
// using the org's dry volume factors.

export interface MixDesign {
  code: string;
  label: string;
  type: "concrete" | "mortar";
  // Nominal mix ratio parts: cement : fine : coarse (coarse = 0 for mortar)
  ratioC: number;
  ratioF: number;
  ratioG: number;
  description: string;
}

export const MIX_DESIGNS: MixDesign[] = [
  // Concrete mixes (IS 456 / DUDBC standard)
  { code: "M7.5", label: "M7.5 (1:4:8)", type: "concrete", ratioC: 1, ratioF: 4, ratioG: 8, description: "Lean concrete, blinding / mass fill" },
  { code: "M10", label: "M10 (1:3:6)", type: "concrete", ratioC: 1, ratioF: 3, ratioG: 6, description: "PCC for foundations" },
  { code: "M15", label: "M15 (1:2:4)", type: "concrete", ratioC: 1, ratioF: 2, ratioG: 4, description: "General RCC members" },
  { code: "M20", label: "M20 (1:1.5:3)", type: "concrete", ratioC: 1, ratioF: 1.5, ratioG: 3, description: "Structural RCC (beams, columns, slabs)" },
  { code: "M25", label: "M25 (1:1:2)", type: "concrete", ratioC: 1, ratioF: 1, ratioG: 2, description: "High-strength structural members" },

  // Mortar mixes
  { code: "CM1:2", label: "Cement Mortar 1:2", type: "mortar", ratioC: 1, ratioF: 2, ratioG: 0, description: "Waterproofing plaster, flooring topping" },
  { code: "CM1:3", label: "Cement Mortar 1:3", type: "mortar", ratioC: 1, ratioF: 3, ratioG: 0, description: "Plaster, tile bedding" },
  { code: "CM1:4", label: "Cement Mortar 1:4", type: "mortar", ratioC: 1, ratioF: 4, ratioG: 0, description: "Brick masonry in super-structure" },
  { code: "CM1:5", label: "Cement Mortar 1:5", type: "mortar", ratioC: 1, ratioF: 5, ratioG: 0, description: "Brick masonry in sub-structure" },
  { code: "CM1:6", label: "Cement Mortar 1:6", type: "mortar", ratioC: 1, ratioF: 6, ratioG: 0, description: "Stone masonry" },
];

// Calculate material quantities per 1 cum of compacted (wet) volume.
// Returns quantities in standard units: cement in bags (50kg), sand/aggregate in cft.
// 1 bag PPC/OPC = 50 kg; 1 cum cement ≈ 1440 kg (bulk density); 1 cum = 35.3147 cft.
export function computeMixQuantities(
  mix: MixDesign,
  dryVolumeMortar: number,  // from OrgRateSettings
  dryVolumeConcrete: number // from OrgRateSettings
) {
  const dryFactor = mix.type === "mortar" ? dryVolumeMortar : dryVolumeConcrete;
  const totalParts = mix.ratioC + mix.ratioF + mix.ratioG;

  // Volume of dry mix needed per 1 cum wet output
  const dryMixVol = 1 * dryFactor; // cum

  // Volume of cement per 1 cum wet output (cum)
  const cementVol = (mix.ratioC / totalParts) * dryMixVol;
  // Convert to bags: 1 bag = 50kg, bulk density 1440 kg/cum => 1 bag = 50/1440 cum
  const cementBags = cementVol / (50 / 1440);

  // Sand in cft
  const sandCum = (mix.ratioF / totalParts) * dryMixVol;
  const sandCft = sandCum * 35.3147;

  // Coarse aggregate in cft (0 for mortar)
  const aggregateCum = (mix.ratioG / totalParts) * dryMixVol;
  const aggregateCft = aggregateCum * 35.3147;

  return {
    cementBags: +cementBags.toFixed(3),
    sandCft: +sandCft.toFixed(3),
    aggregateCft: +aggregateCft.toFixed(3),
  };
}
