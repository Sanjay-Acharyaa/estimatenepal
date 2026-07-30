import { computeQuantity, effectiveScale, perSegmentEffectiveScale } from "../lib/takeoff";

const NO_ZONES: never[] = [];

// ── effectiveScale ─────────────────────────────────────────────────────────────

describe("effectiveScale", () => {
  const zone = { x: 0, y: 0, width: 200, height: 200, scale: 0.05, scaleUnit: "m" };

  it("returns null when no page scale and no zones", () => {
    expect(effectiveScale([], null, "m", NO_ZONES)).toBeNull();
    expect(effectiveScale([{ x: 50, y: 50 }], null, "m", NO_ZONES)).toBeNull();
  });

  it("returns page scale when no zones and page scale is set", () => {
    const result = effectiveScale([{ x: 50, y: 50 }], 0.01, "m", NO_ZONES);
    expect(result).toEqual({ scale: 0.01, scaleUnit: "m" });
  });

  it("returns zone scale when centroid is inside the zone", () => {
    const result = effectiveScale([{ x: 100, y: 100 }], 0.01, "m", [zone]);
    expect(result).toEqual({ scale: 0.05, scaleUnit: "m" });
  });

  it("falls back to page scale when centroid is outside all zones", () => {
    const result = effectiveScale([{ x: 300, y: 300 }], 0.01, "m", [zone]);
    expect(result).toEqual({ scale: 0.01, scaleUnit: "m" });
  });

  it("uses centroid of multiple points for zone lookup", () => {
    // Two points: one inside zone (100,100) and one outside (300,300) → centroid (200,200) = on zone edge (inside)
    const result = effectiveScale([{ x: 100, y: 100 }, { x: 300, y: 300 }], 0.01, "m", [zone]);
    // centroid is at (200,200), which is the boundary (included: <= check)
    expect(result).toEqual({ scale: 0.05, scaleUnit: "m" });
  });

  it("returns page scale for empty point array when page scale is set", () => {
    const result = effectiveScale([], 0.02, "ft", NO_ZONES);
    expect(result).toEqual({ scale: 0.02, scaleUnit: "ft" });
  });
});

// ── perSegmentEffectiveScale ───────────────────────────────────────────────────

describe("perSegmentEffectiveScale", () => {
  const zoneA = { x: 0, y: 0, width: 100, height: 100, scale: 0.01, scaleUnit: "m" };
  const zoneB = { x: 100, y: 0, width: 100, height: 100, scale: 0.02, scaleUnit: "m" };

  it("returns page scale for single-point polyline (no segments)", () => {
    const result = perSegmentEffectiveScale([{ x: 50, y: 50 }], 0.015, "m", [zoneA, zoneB]);
    expect(result).toEqual({ scale: 0.01, scaleUnit: "m" }); // centroid in zoneA
  });

  it("length-weights scale across two equal-length segments in different zones", () => {
    // Segment 1: (0,50)→(100,50) midpoint=(50,50) in zoneA → scale 0.01
    // Segment 2: (100,50)→(200,50) midpoint=(150,50) in zoneB → scale 0.02
    // Both segments are 100px, so weighted average = (0.01+0.02)/2 = 0.015
    const result = perSegmentEffectiveScale(
      [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 200, y: 50 }],
      0.005, "m", [zoneA, zoneB]
    );
    expect(result).not.toBeNull();
    expect(result!.scale).toBeCloseTo(0.015, 6);
    expect(result!.scaleUnit).toBe("m");
  });
});

// ── computeQuantity ────────────────────────────────────────────────────────────

describe("computeQuantity — COUNT", () => {
  it("counts number of points", () => {
    const pts = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    const { rawQuantity, quantity, unit } = computeQuantity("COUNT", { points: pts }, 0.01, "m", 1);
    expect(rawQuantity).toBe(3);
    expect(quantity).toBe(3);
    expect(unit).toBe("each");
  });

  it("applies multiplier to quantity but not rawQuantity", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const { rawQuantity, quantity } = computeQuantity("COUNT", { points: pts }, 0.01, "m", 2);
    expect(rawQuantity).toBe(2);
    expect(quantity).toBe(4);
  });

  it("returns zero for zero scale", () => {
    const { rawQuantity, quantity } = computeQuantity("COUNT", { points: [{ x: 0, y: 0 }] }, 0, "m", 1);
    expect(rawQuantity).toBe(0);
    expect(quantity).toBe(0);
  });
});

describe("computeQuantity — LINEAR", () => {
  it("computes straight-line segment (POLYLINE)", () => {
    // 100px segment at scale 0.01 m/px → 1.0 m
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { rawQuantity, quantity, unit } = computeQuantity("LINEAR", { points: pts }, 0.01, "m", 1);
    expect(rawQuantity).toBeCloseTo(1.0, 6);
    expect(quantity).toBeCloseTo(1.0, 6);
    expect(unit).toBe("m");
  });

  it("computes circle circumference (CIRCLE shapeType)", () => {
    // center (0,0), edge (100,0) → r=100px, scale=0.01 → circumference = 2π m
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { rawQuantity, unit } = computeQuantity("LINEAR", { points: pts }, 0.01, "m", 1, undefined, "CIRCLE");
    expect(rawQuantity).toBeCloseTo(2 * Math.PI, 4);
    expect(unit).toBe("m");
  });

  it("uses ft unit when scaleUnit is ft", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { unit } = computeQuantity("LINEAR", { points: pts }, 1, "ft", 1);
    expect(unit).toBe("ft");
  });
});

describe("computeQuantity — AREA", () => {
  it("computes polygon area (RECTANGLE)", () => {
    // 100×100 px square, scale 0.01 m/px → area = 1.0 sq m
    const pts = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    const { rawQuantity, unit } = computeQuantity("AREA", { points: pts }, 0.01, "m", 1);
    expect(rawQuantity).toBeCloseTo(1.0, 4);
    expect(unit).toBe("sq m");
  });

  it("computes circle area (CIRCLE shapeType)", () => {
    // center (0,0), edge (100,0) → r=100px, scale=0.01 → area = π sq m
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { rawQuantity, unit } = computeQuantity("AREA", { points: pts }, 0.01, "m", 1, undefined, "CIRCLE");
    expect(rawQuantity).toBeCloseTo(Math.PI, 4);
    expect(unit).toBe("sq m");
  });

  it("ARC AREA uses circular segment formula (r²/2)(θ−sinθ), not sector r²θ/2", () => {
    // Quarter-circle: start=(100,0), end=(0,100), mid=(100/√2, 100/√2) centred on (0,0)
    // r=100, sweep=π/2
    //   segment = (r²/2)(π/2 − sin(π/2)) = 5000*(π/2 − 1) ≈ 2854 px²
    //   sector  = (r²/2)*π/2 = 5000*π/2                    ≈ 7854 px²  (wrong formula)
    const m = 100 / Math.SQRT2; // exact midpoint on circle
    const qPts = [{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: m, y: m }];
    const { rawQuantity: segArea } = computeQuantity("AREA", { points: qPts }, 1, "m", 1, undefined, "ARC");
    const r = 100;
    const sweep = Math.PI / 2;
    const expectedSegment = 0.5 * r * r * (sweep - Math.sin(sweep));
    const wrongSector = 0.5 * r * r * sweep;
    expect(segArea).toBeCloseTo(expectedSegment, 0); // ~2854 px²
    expect(Math.abs(segArea - wrongSector)).toBeGreaterThan(100); // not the sector value ~7854 px²
  });

  it("returns sq ft when scaleUnit is ft", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const { unit } = computeQuantity("AREA", { points: pts }, 1, "ft", 1);
    expect(unit).toBe("sq ft");
  });
});

describe("computeQuantity — VERTICAL_WALL_AREA", () => {
  it("returns perimeter with 'set wall height' hint when no wall height", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { rawQuantity, unit } = computeQuantity("VERTICAL_WALL_AREA", { points: pts }, 0.01, "m", 1);
    expect(rawQuantity).toBeCloseTo(1.0, 4);
    expect(unit).toContain("set wall height");
  });

  it("multiplies perimeter by wall height", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    // perimeter = 1.0 m, wall height = 3 ft = 3×0.3048 m ≈ 0.9144 m → area ≈ 0.9144 sqm
    const ap = { wall: { enabled: true, heightFt: 3, heightIn: 0 } };
    const { quantity, unit } = computeQuantity("VERTICAL_WALL_AREA", { points: pts }, 0.01, "m", 1, ap);
    expect(quantity).toBeCloseTo(1.0 * 3 * 0.3048, 4);
    expect(unit).toBe("sq m");
  });
});

describe("computeQuantity — VOLUME", () => {
  it("area_x_h method: returns area with 'set height' hint when no height", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const { rawQuantity, unit } = computeQuantity("VOLUME", { points: pts }, 0.01, "m", 1, undefined, "RECTANGLE");
    expect(rawQuantity).toBeCloseTo(1.0, 4);
    expect(unit).toContain("set height");
  });

  it("area_x_h method: area × height gives cu m", () => {
    // 100×100 px at scale 0.01 → area=1 sqm; height=2 ft=0.6096 m → volume=0.6096 cu m
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const ap = { height: { ft: 2, in: 0 }, volumeMethod: "area_x_h" as const };
    const { quantity, unit } = computeQuantity("VOLUME", { points: pts }, 0.01, "m", 1, ap, "RECTANGLE");
    expect(quantity).toBeCloseTo(1.0 * 2 * 0.3048, 4);
    expect(unit).toBe("cu m");
  });

  it("lbh method: length × breadth × height gives cu m", () => {
    // 100px line at scale 0.01 → length=1 m; breadth=1 ft=0.3048 m; height=2 ft=0.6096 m
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const ap = { volumeMethod: "lbh" as const, breadth: { ft: 1, in: 0 }, height: { ft: 2, in: 0 } };
    const { quantity, unit } = computeQuantity("VOLUME", { points: pts }, 0.01, "m", 1, ap, "POLYLINE");
    expect(quantity).toBeCloseTo(1.0 * 0.3048 * 2 * 0.3048, 4);
    expect(unit).toBe("cu m");
  });
});

describe("computeQuantity — COUNT_BY_DISTANCE", () => {
  it("returns raw length with hint when spacing not set", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { rawQuantity, unit } = computeQuantity("COUNT_BY_DISTANCE", { points: pts }, 0.01, "m", 1);
    expect(rawQuantity).toBeCloseTo(1.0, 4);
    expect(unit).toContain("set spacing");
  });

  it("computes fence-post count (length / spacing + 1)", () => {
    // 5 m line, spacing = 1 ft = 0.3048 m → count = floor(5/0.3048) + 1 = 16 + 1 = 17
    const pts = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
    const ap = { spacing: { ft: 1, in: 0 } };
    const { quantity, unit } = computeQuantity("COUNT_BY_DISTANCE", { points: pts }, 0.01, "m", 1, ap);
    const lengthM = 5.0;
    const spacingM = 0.3048;
    const expected = Math.floor(lengthM / spacingM) + 1;
    expect(quantity).toBe(expected);
    expect(unit).toBe("each");
  });
});