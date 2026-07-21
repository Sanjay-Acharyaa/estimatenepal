import { normalizeUnit, getConversionFactor } from "../lib/unit-conversions";

describe("normalizeUnit", () => {
  it("handles DUDBC metric unit spellings", () => {
    expect(normalizeUnit("Cu.m.")).toBe("cum");
    expect(normalizeUnit("Sq.m.")).toBe("sqm");
    expect(normalizeUnit("Rm.")).toBe("rm");
    expect(normalizeUnit("m3")).toBe("cum");
    expect(normalizeUnit("m2")).toBe("sqm");
  });

  it("handles takeoff imperial unit spellings", () => {
    expect(normalizeUnit("cu ft")).toBe("cuft");
    expect(normalizeUnit("cft")).toBe("cuft");
    expect(normalizeUnit("sq ft")).toBe("sqft");
    expect(normalizeUnit("sft")).toBe("sqft");
    expect(normalizeUnit("ft")).toBe("ft");
  });

  it("handles Unicode superscripts", () => {
    expect(normalizeUnit("m³")).toBe("cum");
    expect(normalizeUnit("m²")).toBe("sqm");
  });

  it("treats bare m as linear metre (rm)", () => {
    expect(normalizeUnit("m")).toBe("rm");
  });

  it("is case-insensitive", () => {
    expect(normalizeUnit("CU.M.")).toBe("cum");
    expect(normalizeUnit("SQ FT")).toBe("sqft");
  });
});

describe("getConversionFactor", () => {
  it("returns 1 for same unit in different spellings", () => {
    expect(getConversionFactor("Cu.m.", "cu m")).toBe(1);
    expect(getConversionFactor("Sq.m.", "sqm")).toBe(1);
    expect(getConversionFactor("Rm.", "m")).toBe(1);
    expect(getConversionFactor("cu ft", "cft")).toBe(1);
  });

  it("converts cu ft → Cu.m. correctly", () => {
    const f = getConversionFactor("cu ft", "Cu.m.");
    expect(f).not.toBeNull();
    expect(f!).toBeCloseTo(0.028317, 5);
    // Verify: 1 cu ft × factor = 0.028317 m³
    expect(1 * f!).toBeCloseTo(0.028317, 4);
  });

  it("converts sq ft → Sq.m. correctly", () => {
    const f = getConversionFactor("sq ft", "Sq.m.");
    expect(f).not.toBeNull();
    expect(f!).toBeCloseTo(0.092903, 5);
  });

  it("converts ft → Rm. correctly", () => {
    const f = getConversionFactor("ft", "Rm.");
    expect(f).not.toBeNull();
    expect(f!).toBe(0.3048);
  });

  it("inverse conversions are reciprocals", () => {
    const fwd = getConversionFactor("cu ft", "Cu.m.")!;
    const inv = getConversionFactor("Cu.m.", "cu ft")!;
    expect(fwd * inv).toBeCloseTo(1, 9);
  });

  it("returns null for unknown unit pairs", () => {
    expect(getConversionFactor("kg", "ton")).toBeNull();
    expect(getConversionFactor("bag", "kg")).toBeNull();
    expect(getConversionFactor("hr", "day")).toBeNull();
  });

  it("round-trip: 100 cu ft in Cu.m. back to cu ft", () => {
    const toCum = getConversionFactor("cu ft", "Cu.m.")!;
    const toFt  = getConversionFactor("Cu.m.", "cu ft")!;
    expect(100 * toCum * toFt).toBeCloseTo(100, 6);
  });

  it("validates known real-world values", () => {
    // 10 Cu.m. = 353.147 cu ft
    const f = getConversionFactor("Cu.m.", "cu ft")!;
    expect(10 * f).toBeCloseTo(353.147, 2);
    // 100 Sq.m. = 1076.39 sq ft
    const fa = getConversionFactor("Sq.m.", "sq ft")!;
    expect(100 * fa).toBeCloseTo(1076.39, 1);
    // 100 Rm. = 328.08 ft
    const fl = getConversionFactor("Rm.", "ft")!;
    expect(100 * fl).toBeCloseTo(328.08, 1);
  });
});

describe("edge cases", () => {
  it("normalizeUnit handles empty string", () => {
    expect(normalizeUnit("")).toBe("");
  });

  it("normalizeUnit handles whitespace-only string", () => {
    expect(normalizeUnit("   ")).toBe("");
  });

  it("getConversionFactor returns null for empty string units", () => {
    expect(getConversionFactor("", "Cu.m.")).toBeNull();
    expect(getConversionFactor("cu ft", "")).toBeNull();
  });
});
