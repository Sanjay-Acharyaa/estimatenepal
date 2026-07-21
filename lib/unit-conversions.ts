/**
 * Unit conversion for BOQ calculation.
 * Takeoff measures in drawing units (ft, sq ft, cu ft).
 * DUDBC rates are in metric (Rm., Sq.m., Cu.m.).
 * Conversion happens at BOQ compute time — rates are never altered.
 */

const UNIT_ALIAS_MAP: Record<string, string> = {
  cum: "cum", m3: "cum",
  cuft: "cuft", cft: "cuft",
  sqm: "sqm", m2: "sqm",
  sqft: "sqft", sft: "sqft",
  rm: "rm", rmt: "rm",
  // "m" alone is linear metre (running metre) — NOT square/cubic; DUDBC uses "Rm." for running metre
  m: "rm",
  ft: "ft", lft: "ft", rft: "ft", feet: "ft",
  nos: "ea", no: "ea", ea: "ea", each: "ea", pcs: "ea",
  kg: "kg",
  ton: "ton", mt: "ton", tonne: "ton",
  hr: "hr", hour: "hr", hrs: "hr",
  day: "day",
  bag: "bag",
};

/** Valid normalized unit pair keys used in CONVERSION_FACTORS. Format: "fromNorm:toNorm". */
export type ConversionPair =
  | "cuft:cum" | "cum:cuft"
  | "sqft:sqm" | "sqm:sqft"
  | "ft:rm"    | "rm:ft"
  | "kg:ton"   | "ton:kg";

export function normalizeUnit(u: string): string {
  const s = u
    .toLowerCase()
    .replace(/²/g, "2")  // m² → m2
    .replace(/³/g, "3")  // m³ → m3
    .replace(/\./g, "")        // Cu.m. → cum, Rm. → rm
    .replace(/\s+/g, "");      // "cu m" → "cum", "sq ft" → "sqft"

  return UNIT_ALIAS_MAP[s] ?? s;
}

// SI-exact conversion factors. Key = "fromNorm:toNorm".
export const CONVERSION_FACTORS: Record<string, number> = {
  "cuft:cum":  0.028316846592,   // 1 cu ft = 0.028316846592 m³ (exact SI)
  "cum:cuft":  35.3146667215,    // 1 m³ = 35.3146667215 cu ft
  "sqft:sqm":  0.09290304,       // 1 sq ft = 0.09290304 m² (exact SI)
  "sqm:sqft":  10.7639104167,    // 1 m² = 10.7639104167 sq ft
  "ft:rm":     0.3048,           // 1 ft = 0.3048 m (exact SI)
  "rm:ft":     3.28083989501,    // 1 m = 3.28083989501 ft
  "kg:ton":    0.001,            // 1 kg = 0.001 metric ton
  "ton:kg":    1000,             // 1 metric ton = 1000 kg
};

/**
 * Returns the factor to multiply fromUnit quantities by to get toUnit.
 * Returns 1 when units are equivalent. Returns null when no conversion is known.
 */
export function getConversionFactor(fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to   = normalizeUnit(toUnit);
  if (from === to) return 1;
  return CONVERSION_FACTORS[`${from}:${to}`] ?? null;
}
