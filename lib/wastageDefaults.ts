export interface WastageDefault {
  pct: number;
  reason: string;
}

const DEFAULTS: Array<{ keywords: string[]; pct: number; reason: string }> = [
  { keywords: ["concrete", "concret", "rcc", "pcc"],                   pct: 2,  reason: "cutting & spillage" },
  { keywords: ["cement", "mortar"],                                      pct: 4,  reason: "bag breakage & mixing losses" },
  { keywords: ["sand", "fine aggregate"],                                pct: 5,  reason: "handling & sieve losses" },
  { keywords: ["gravel", "coarse aggregate", "stone chips", "grit"],    pct: 3,  reason: "handling losses" },
  { keywords: ["brick", "block", "masonry", "bata", "pahelo itta"],    pct: 8,  reason: "cutting & breakage" },
  { keywords: ["steel", "rebar", "rod", "reinforcement"],               pct: 3,  reason: "off-cuts & laps" },
  { keywords: ["timber", "wood", "plank", "lumber", "batten", "daru"], pct: 12, reason: "sawing & cutting losses" },
  { keywords: ["paint", "primer", "coating", "distemper", "emulsion"], pct: 5,  reason: "brush & roller losses" },
  { keywords: ["tile", "flooring", "ceramic", "vitrified"],            pct: 10, reason: "cutting & breakage" },
  { keywords: ["glass", "glazing"],                                      pct: 5,  reason: "cutting & breakage" },
  { keywords: ["pvc", "hdpe", "pipe", "plumbing"],                      pct: 3,  reason: "cutting & joints" },
  { keywords: ["wire", "cable", "electrical", "conduit"],               pct: 5,  reason: "cutting & routing" },
  { keywords: ["plaster", "render", "stucco"],                          pct: 5,  reason: "mixing & application losses" },
  { keywords: ["waterproof", "membrane", "bitumen"],                    pct: 5,  reason: "laps & cutting" },
  { keywords: ["roofing", "gci", "tin sheet", "zinc"],                  pct: 5,  reason: "cutting & laps" },
  { keywords: ["formwork", "shuttering", "centering", "falsework"],     pct: 15, reason: "damage & reuse factor" },
  { keywords: ["stone", "boulder", "rubble", "dhunge"],                 pct: 5,  reason: "irregular sizing & breaking" },
  { keywords: ["marble", "granite"],                                     pct: 10, reason: "cutting & polishing losses" },
  { keywords: ["aggregate"],                                             pct: 3,  reason: "handling losses" },
];

export function getWastageDefault(label: string): WastageDefault | null {
  const lower = label.toLowerCase();
  for (const entry of DEFAULTS) {
    if (entry.keywords.some(k => lower.includes(k))) {
      return { pct: entry.pct, reason: entry.reason };
    }
  }
  return null;
}
