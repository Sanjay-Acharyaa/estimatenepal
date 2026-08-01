import { computeQuantity, effectiveScale, perSegmentEffectiveScale, boundingBoxWeightedScale, arcSvgPath } from "../lib/takeoff";

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

  it("computes fence-post count including endpoint (ceil(L/S)+1)", () => {
    // 5 m line, spacing = 1 ft = 0.3048 m → ceil(5/0.3048)+1 = 17+1 = 18 (endpoint included)
    const pts = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
    const ap = { spacing: { ft: 1, in: 0 } };
    const { quantity, unit } = computeQuantity("COUNT_BY_DISTANCE", { points: pts }, 0.01, "m", 1, ap);
    const lengthM = 5.0;
    const spacingM = 0.3048;
    const expected = Math.ceil(lengthM / spacingM - 1e-9) + 1;
    expect(quantity).toBe(expected);
    expect(unit).toBe("each");
  });
});

// ── computeGroupTotal ──────────────────────────────────────────────────────────
import { computeGroupTotal } from "../lib/boq";

const item = (rawQuantity: number, unit: string, shapeType?: string | null, isNegative = false) =>
  ({ rawQuantity, unit, shapeType: shapeType ?? null, isNegative });

describe("computeGroupTotal — LINEAR / AREA / COUNT (passthrough)", () => {
  it("sums rawQuantity for LINEAR items and applies multiplier", () => {
    const group = { type: "LINEAR", additionalParams: null, multiplier: 2 };
    const items = [item(3, "m"), item(2, "m")];
    const { qty, unit } = computeGroupTotal(group, items);
    expect(qty).toBeCloseTo(10, 6); // (3+2)*2
    expect(unit).toBe("m");
  });

  it("subtracts isNegative items", () => {
    const group = { type: "AREA", additionalParams: null, multiplier: 1 };
    const items = [item(10, "sq m"), item(3, "sq m", null, true)];
    const { qty } = computeGroupTotal(group, items);
    expect(qty).toBeCloseTo(7, 6);
  });

  it("normalises mixed ft/m units to metric", () => {
    const group = { type: "LINEAR", additionalParams: null, multiplier: 1 };
    const items = [item(1, "m"), item(1, "ft")]; // 1 m + 0.3048 m
    const { qty, unit } = computeGroupTotal(group, items);
    expect(qty).toBeCloseTo(1.3048, 4);
    expect(unit).toBe("m");
  });

  // Stale unit tests — Issue #9: unit field survives group type changes
  it("AREA group with stale 'ft' unit (LINEAR→AREA type change, ft scale) returns sq ft", () => {
    // After LINEAR→AREA type change, items may briefly have unit="ft" (stale) instead of "sq ft".
    // computeGroupTotal must derive the display unit from group.type + imperial flag,
    // not from the stale stored unit string.
    const group = { type: "AREA", additionalParams: null, multiplier: 1 };
    const items = [item(10, "ft"), item(5, "ft")]; // stale LINEAR unit; rawQuantity is sq ft after recompute
    const { qty, unit } = computeGroupTotal(group, items);
    expect(qty).toBe(15);
    expect(unit).toBe("sq ft"); // must NOT be "ft"
  });

  it("AREA group with stale 'm' unit (LINEAR→AREA type change, m scale) returns sq m", () => {
    const group = { type: "AREA", additionalParams: null, multiplier: 1 };
    const items = [item(10, "m"), item(5, "m")]; // stale LINEAR unit
    const { qty, unit } = computeGroupTotal(group, items);
    expect(qty).toBe(15);
    expect(unit).toBe("sq m"); // must NOT be "m"
  });

  it("LINEAR group with stale 'sq ft' unit (AREA→LINEAR type change) returns ft", () => {
    const group = { type: "LINEAR", additionalParams: null, multiplier: 1 };
    const items = [item(10, "sq ft")]; // stale AREA unit
    const { qty, unit } = computeGroupTotal(group, items);
    expect(qty).toBe(10);
    expect(unit).toBe("ft"); // must NOT be "sq ft"
  });

  it("AREA mixed-zone normalisation uses area factor (0.3048²) not linear (0.3048)", () => {
    // One item from ft-scale zone (sq ft), one from m-scale zone (sq m).
    // The ft item must be converted with 0.3048² (area), not 0.3048 (linear).
    // 10 sq ft = 10 × 0.09290304 = 0.9290304 sq m  →  total ≈ 1.9290304 sq m
    const group = { type: "AREA", additionalParams: null, multiplier: 1 };
    const items = [item(10, "sq ft"), item(1, "sq m")];
    const { qty, unit } = computeGroupTotal(group, items);
    expect(qty).toBeCloseTo(10 * 0.3048 * 0.3048 + 1, 4);
    expect(unit).toBe("sq m");
  });
});

describe("computeGroupTotal — VERTICAL_WALL_AREA", () => {
  it("returns perimeter unit when wall height is zero", () => {
    const group = { type: "VERTICAL_WALL_AREA", additionalParams: null, multiplier: 1 };
    const { qty, unit } = computeGroupTotal(group, [item(5, "m")]);
    expect(qty).toBe(0);
    expect(unit).toBe("m (set wall height)");
  });

  it("area = perimeter × wall_height × multiplier", () => {
    // 10 m perimeter × 3 ft wall height (0.9144 m) × multiplier 2 = 18.288 sq m
    const group = {
      type: "VERTICAL_WALL_AREA",
      additionalParams: { wall: { enabled: true, heightFt: 3, heightIn: 0 } },
      multiplier: 2,
    };
    const { qty, unit } = computeGroupTotal(group, [item(10, "m")]);
    expect(qty).toBeCloseTo(10 * 3 * 0.3048 * 2, 4);
    expect(unit).toBe("sq m");
  });
});

describe("computeGroupTotal — COUNT_BY_DISTANCE", () => {
  it("sums raw length when no spacing", () => {
    const group = { type: "COUNT_BY_DISTANCE", additionalParams: null, multiplier: 1 };
    const { qty, unit } = computeGroupTotal(group, [item(5, "m")]);
    expect(qty).toBeCloseTo(5, 6);
    expect(unit).toBe("m");
  });

  it("computes fence-post count including endpoint: ceil(L/spacing)+1 per item", () => {
    // 6 m at ~1 m spacing → ceil(6/1)+1 = 7 each (endpoint always included)
    const group = {
      type: "COUNT_BY_DISTANCE",
      additionalParams: { spacing: { ft: 3.28084, in: 0 } }, // ~1 m in ft
      multiplier: 1,
    };
    const ftSpacing = 3.28084 * 0.3048; // ≈1 m
    const { qty, unit } = computeGroupTotal(group, [item(6, "m")]);
    expect(qty).toBe(Math.ceil(6 / ftSpacing - 1e-9) + 1);
    expect(unit).toBe("each");
  });
});

describe("computeGroupTotal — VOLUME area_x_h", () => {
  it("returns sq-m unit when height not set", () => {
    const group = { type: "VOLUME", additionalParams: { volumeMethod: "area_x_h" }, multiplier: 1 };
    const { qty, unit } = computeGroupTotal(group, [item(4, "sq m", "RECTANGLE")]);
    // height=null → factor 1, unit falls back to area unit
    expect(qty).toBeCloseTo(4, 6);
    expect(unit).toBe("sq m");
  });

  it("area × height × multiplier = cu m", () => {
    // area=4 sq m, height=2 ft=0.6096 m, multiplier=3 → 4*0.6096*3
    const group = {
      type: "VOLUME",
      additionalParams: { volumeMethod: "area_x_h", height: { ft: 2, in: 0 } },
      multiplier: 3,
    };
    const { qty, unit } = computeGroupTotal(group, [item(4, "sq m", "RECTANGLE")]);
    expect(qty).toBeCloseTo(4 * 2 * 0.3048 * 3, 4);
    expect(unit).toBe("cu m");
  });

  it("excludes POLYLINE items in area_x_h mode and counts them", () => {
    const group = { type: "VOLUME", additionalParams: { volumeMethod: "area_x_h", height: { ft: 1, in: 0 } }, multiplier: 1 };
    const { qty, excludedShapeCount } = computeGroupTotal(group, [
      item(4, "sq m", "RECTANGLE"),
      item(3, "m", "POLYLINE"), // should be excluded
    ]);
    expect(excludedShapeCount).toBe(1);
    expect(qty).toBeCloseTo(4 * 0.3048, 4); // only rectangle counted
  });
});

describe("computeGroupTotal — VOLUME lbh", () => {
  it("length × breadth × height × multiplier = cu m", () => {
    // 5 m POLYLINE, breadth=1 ft=0.3048 m, height=2 ft=0.6096 m, multiplier=2
    const group = {
      type: "VOLUME",
      additionalParams: { volumeMethod: "lbh", breadth: { ft: 1, in: 0 }, height: { ft: 2, in: 0 } },
      multiplier: 2,
    };
    const { qty, unit } = computeGroupTotal(group, [item(5, "m", "POLYLINE")]);
    expect(qty).toBeCloseTo(5 * 0.3048 * 2 * 0.3048 * 2, 4);
    expect(unit).toBe("cu m");
  });

  it("excludes non-POLYLINE/ARC items in lbh mode", () => {
    const group = {
      type: "VOLUME",
      additionalParams: { volumeMethod: "lbh", breadth: { ft: 1, in: 0 }, height: { ft: 1, in: 0 } },
      multiplier: 1,
    };
    const { excludedShapeCount } = computeGroupTotal(group, [
      item(5, "m", "POLYLINE"),
      item(4, "sq m", "RECTANGLE"), // should be excluded
    ]);
    expect(excludedShapeCount).toBe(1);
  });
});

// ── boundingBoxWeightedScale ───────────────────────────────────────────────────

describe("boundingBoxWeightedScale", () => {
  const zone = { x: 0, y: 0, width: 200, height: 200, scale: 0.05, scaleUnit: "m" };

  it("falls back to centroid when no zones", () => {
    const pts = [{ x: 10, y: 10 }, { x: 100, y: 100 }];
    const result = boundingBoxWeightedScale(pts, 0.01, "m", []);
    expect(result).toEqual({ scale: 0.01, scaleUnit: "m" });
  });

  it("returns zone scale when entire bbox is inside one zone", () => {
    const pts = [{ x: 10, y: 10 }, { x: 100, y: 50 }, { x: 50, y: 100 }];
    const result = boundingBoxWeightedScale(pts, 0.01, "m", [zone]);
    expect(result).not.toBeNull();
    expect(result!.scale).toBeCloseTo(0.05, 6);
  });

  it("area-weights scale across two adjacent zones", () => {
    // Shape straddles zoneA (scale 0.01) and zoneB (scale 0.02) equally
    const zoneA = { x: 0, y: 0, width: 100, height: 100, scale: 0.01, scaleUnit: "m" };
    const zoneB = { x: 100, y: 0, width: 100, height: 100, scale: 0.02, scaleUnit: "m" };
    // Rectangle [50,0]→[150,100] overlaps 50×100=5000 of zoneA and 50×100=5000 of zoneB
    const pts = [{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 100 }, { x: 50, y: 100 }];
    const result = boundingBoxWeightedScale(pts, null, "m", [zoneA, zoneB]);
    expect(result).not.toBeNull();
    expect(result!.scale).toBeCloseTo(0.015, 6); // (0.01+0.02)/2
  });

  it("uses circular bbox for CIRCLE shapeType", () => {
    // center (100,100), edge (200,100) → r=100; bbox [0,0,200,200] = all in zone
    const circlePts = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    const result = boundingBoxWeightedScale(circlePts, 0.01, "m", [zone], "CIRCLE");
    expect(result).not.toBeNull();
    expect(result!.scale).toBeCloseTo(0.05, 6);
  });

  it("uncovered area uses page scale in weighted average", () => {
    // Shape [0,0]→[300,100]: 200×100 inside zone (scale 0.05), 100×100 outside (page scale 0.01)
    const pts = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 0, y: 100 }];
    const result = boundingBoxWeightedScale(pts, 0.01, "m", [zone]);
    expect(result).not.toBeNull();
    // Weighted: (20000*0.05 + 10000*0.01) / 30000 = (1000+100)/30000 ≈ 0.03667
    expect(result!.scale).toBeCloseTo((20000 * 0.05 + 10000 * 0.01) / 30000, 5);
  });
});

// ── arcSvgPath ────────────────────────────────────────────────────────────────

describe("arcSvgPath", () => {
  it("returns a line fallback when points are collinear", () => {
    // A=(0,0), B=(100,0), C=(50,0) — all on the same horizontal line
    const path = arcSvgPath({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 });
    expect(path).toBe("M 0 0 L 100 0");
  });

  it("produces an SVG A-command path for a quarter-circle arc", () => {
    // Unit circle: A=(1,0), B=(0,1), C midpoint on CCW arc ≈ (cos45°, sin45°) = (√2/2, √2/2)
    const m = Math.SQRT2 / 2;
    const path = arcSvgPath({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: m, y: m });
    // format: M x y A rx ry x-rot large-arc sweep ex ey (11 space-separated tokens)
    expect(path).toMatch(/^M 1 0 A /);
    const parts = path.split(" ");
    // parts: [M, 1, 0, A, rx, ry, 0, largeArcFlag, sweepFlag, ex, ey]
    const rx = parseFloat(parts[4]);
    expect(rx).toBeCloseTo(1, 3); // radius ≈ 1 for unit circle
  });

  it("sets large-arc-flag=0 for a minor arc (sweep < π)", () => {
    // Quarter-circle sweep = π/2 < π → large-arc-flag must be 0
    const m = Math.SQRT2 / 2;
    const path = arcSvgPath({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: m, y: m });
    const parts = path.split(" ");
    // parts: [M, x, y, A, rx, ry, xrot, largeArcFlag, sweepFlag, ex, ey]
    const largeArcFlag = parts[7];
    expect(largeArcFlag).toBe("0");
  });

  it("sets large-arc-flag=1 for a major arc (sweep > π)", () => {
    // Three-quarter-circle: A=(1,0), B=(0,1), midpoint on CW (long) arc at 225° = (-√2/2, -√2/2)
    // CCW sweep A→B is π/2; the midpoint at 225° is outside that arc so the CW sweep (3π/2) is used.
    const m = -Math.SQRT2 / 2;
    const path = arcSvgPath({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: m, y: m });
    const parts = path.split(" ");
    const largeArcFlag = parts[7];
    expect(largeArcFlag).toBe("1");
  });
});