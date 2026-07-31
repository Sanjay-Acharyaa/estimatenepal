import type { TakeoffTool } from "@prisma/client";

export type Point = { x: number; y: number };
export type ToolData = { points: Point[] };

export const MIN_SHAPE_POINTS: Record<string, number> = {
  CIRCLE: 2, ARC: 3, RECTANGLE: 4, POLYGON: 3, POLYLINE: 2,
};

export type AdditionalParams = {
  wall?: { enabled: boolean; heightFt: number; heightIn: number };
  height?: { ft: number; in: number };           // VOLUME depth/height
  breadth?: { ft: number; in: number };          // VOLUME LBH: breadth/width
  volumeMethod?: "area_x_h" | "lbh";            // VOLUME calculation method
  spacing?: { ft: number; in: number };          // COUNT_BY_DISTANCE item spacing
  paint?: { enabled: boolean };
  pieceSize?: { enabled: boolean; sideAFt: number; sideAIn: number; sideBFt: number; sideBIn: number };
  studSpacing?: { enabled: boolean; spacing: number };
  weight?: { enabled: boolean; weightPerUnit: number };
};

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

// Perimeter of a closed polygon (closes the last point back to first)
function perimeterOfPolygon(pts: Point[]): number {
  if (pts.length < 2) return 0;
  let total = polylineLength(pts);
  const first = pts[0], last = pts[pts.length - 1];
  total += Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
  return total;
}

// Circle radius in pixels: pts[0]=center, pts[1]=edge point
function circleRadiusPx(pts: Point[]): number {
  if (pts.length < 2) return 0;
  return Math.sqrt((pts[1].x - pts[0].x) ** 2 + (pts[1].y - pts[0].y) ** 2);
}

// Circumscribed circle of a 3-point arc: returns { r, sweep, sweepFlag } or null when collinear.
// pts = [start, end, midpoint-on-arc]. sweep is the central angle of the arc in radians.
// sweepFlag matches the SVG arc sweep-flag (1 = midpoint on CCW math arc → CW in screen y-down).
function arcGeometryPx(pts: Point[]): { r: number; sweep: number; sweepFlag: 0 | 1 } | null {
  if (pts.length < 3) return null;
  const [A, B, C] = pts;
  const D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
  if (Math.abs(D) < 1e-10) return null;
  const A2 = A.x ** 2 + A.y ** 2, B2 = B.x ** 2 + B.y ** 2, C2 = C.x ** 2 + C.y ** 2;
  const ux = (A2 * (B.y - C.y) + B2 * (C.y - A.y) + C2 * (A.y - B.y)) / D;
  const uy = (A2 * (C.x - B.x) + B2 * (A.x - C.x) + C2 * (B.x - A.x)) / D;
  const r = Math.sqrt((A.x - ux) ** 2 + (A.y - uy) ** 2);
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const na1 = norm(Math.atan2(A.y - uy, A.x - ux));
  const na2 = norm(Math.atan2(B.y - uy, B.x - ux));
  const nam = norm(Math.atan2(C.y - uy, C.x - ux));
  let ccwSweep = na2 - na1;
  if (ccwSweep < 0) ccwSweep += 2 * Math.PI;
  let namRel = nam - na1;
  if (namRel < 0) namRel += 2 * Math.PI;
  const midOnCcwArc = namRel <= ccwSweep;
  const sweep = midOnCcwArc ? ccwSweep : 2 * Math.PI - ccwSweep;
  const sweepFlag: 0 | 1 = midOnCcwArc ? 1 : 0;
  return { r, sweep, sweepFlag };
}

// Generates an SVG arc path through A (start), B (end), C (midpoint on arc).
// Single source of truth — shared with DrawingCanvas.tsx to avoid drift.
export function arcSvgPath(A: Point, B: Point, C: Point): string {
  const geo = arcGeometryPx([A, B, C]);
  if (!geo) return `M ${A.x} ${A.y} L ${B.x} ${B.y}`;
  const largeArcFlag = geo.sweep > Math.PI ? 1 : 0;
  return `M ${A.x} ${A.y} A ${geo.r} ${geo.r} 0 ${largeArcFlag} ${geo.sweepFlag} ${B.x} ${B.y}`;
}

// Arc length from 3 points (start, end, midpoint-on-arc) using circumscribed circle
function arcLengthPx(pts: Point[]): number {
  if (pts.length < 3) return polylineLength(pts);
  const geo = arcGeometryPx(pts);
  if (!geo) {
    // Collinear — straight line from A to B
    const [A, B] = pts;
    return Math.sqrt((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
  }
  return geo.r * geo.sweep;
}

export function areaUnit(scaleUnit: string): string {
  if (scaleUnit === "ft" || scaleUnit === "in") return "sq ft";
  return "sq m";
}

export function computeQuantity(
  toolType: TakeoffTool,
  toolData: ToolData,
  scale: number,
  scaleUnit: string,
  multiplier: number,
  additionalParams?: AdditionalParams,
  shapeType?: string | null
): { quantity: number; rawQuantity: number; unit: string } {
  if (!scale || scale <= 0) return { quantity: 0, rawQuantity: 0, unit: scaleUnit };

  const pts = toolData.points ?? [];
  if (pts.length === 0) return { quantity: 0, rawQuantity: 0, unit: scaleUnit };

  switch (toolType) {
    case "LINEAR": {
      let rawPx: number;
      if (shapeType === "CIRCLE") {
        rawPx = 2 * Math.PI * circleRadiusPx(pts);
      } else if (shapeType === "ARC") {
        rawPx = arcLengthPx(pts);
      } else if (shapeType === "RECTANGLE" || shapeType === "POLYGON") {
        rawPx = perimeterOfPolygon(pts);
      } else {
        rawPx = polylineLength(pts);
      }
      const raw = rawPx * scale;
      return { rawQuantity: raw, quantity: raw * multiplier, unit: scaleUnit };
    }

    case "COUNT_BY_DISTANCE": {
      // Same length computation as LINEAR, then divide by spacing → count
      let rawPx: number;
      if (shapeType === "CIRCLE") {
        rawPx = 2 * Math.PI * circleRadiusPx(pts);
      } else if (shapeType === "ARC") {
        rawPx = arcLengthPx(pts);
      } else if (shapeType === "RECTANGLE" || shapeType === "POLYGON") {
        rawPx = perimeterOfPolygon(pts);
      } else {
        rawPx = polylineLength(pts);
      }
      const lengthReal = rawPx * scale;

      // spacing is stored as feet+inches; convert to the drawing's scale unit
      const ftToUnit = scaleUnit === "ft" ? 1 : 0.3048;
      const sp = additionalParams?.spacing;
      const spacingFt = sp ? (sp.ft ?? 0) + (sp.in ?? 0) / 12 : 0;
      const spacingInUnit = spacingFt * ftToUnit;
      if (!spacingInUnit) {
        // No spacing set — show raw length with hint so user knows to set it
        return { rawQuantity: lengthReal, quantity: lengthReal * multiplier, unit: `${scaleUnit} (set spacing)` };
      }
      const count = Math.floor(lengthReal / spacingInUnit) + 1;
      return { rawQuantity: lengthReal, quantity: count * multiplier, unit: scaleUnit === "ft" ? "each|ft" : "each" };
    }

    case "AREA": {
      let rawPx2: number;
      if (shapeType === "CIRCLE") {
        const r = circleRadiusPx(pts);
        rawPx2 = Math.PI * r * r;
      } else if (shapeType === "ARC" && pts.length >= 3) {
        // Circular segment area = (r²/2)(θ − sin θ): the region between the arc and its chord.
        // A sector (r²θ/2) would include the triangle back to the centre, which is not the
        // enclosed construction area the user is measuring.
        const geo = arcGeometryPx(pts);
        rawPx2 = geo ? 0.5 * geo.r * geo.r * (geo.sweep - Math.sin(geo.sweep)) : polygonArea(pts);
      } else {
        rawPx2 = polygonArea(pts);
      }
      const raw = rawPx2 * scale * scale;
      return { rawQuantity: raw, quantity: raw * multiplier, unit: areaUnit(scaleUnit) };
    }

    case "VERTICAL_WALL_AREA": {
      // rawQuantity stores the perimeter only so wall height can change without stale data
      let perimPx: number;
      if (shapeType === "CIRCLE") {
        perimPx = 2 * Math.PI * circleRadiusPx(pts);
      } else if (shapeType === "ARC") {
        perimPx = arcLengthPx(pts);
      } else if (shapeType === "RECTANGLE" || shapeType === "POLYGON") {
        perimPx = perimeterOfPolygon(pts);
      } else {
        perimPx = polylineLength(pts);
      }
      const perimeterReal = perimPx * scale;
      // wall height is stored as feet+inches; convert to the drawing's scale unit
      const ftToUnit = scaleUnit === "ft" ? 1 : 0.3048;
      const wall = additionalParams?.wall;
      const wallHFt = wall ? (wall.heightFt ?? 0) + (wall.heightIn ?? 0) / 12 : 0;
      const wallH = wallHFt * ftToUnit;
      if (!wallH) {
        return { rawQuantity: perimeterReal, quantity: perimeterReal * multiplier, unit: `${scaleUnit} (set wall height)` };
      }
      return { rawQuantity: perimeterReal, quantity: perimeterReal * wallH * multiplier, unit: areaUnit(scaleUnit) };
    }

    case "COUNT": {
      const raw = pts.length;
      return { rawQuantity: raw, quantity: raw * multiplier, unit: "each" };
    }

    case "VOLUME": {
      // rawQuantity stores the shape's intrinsic measurement:
      //   POLYLINE / ARC  → length        — used by lbh method (L × B × H)
      //   POLYGON / RECTANGLE / CIRCLE → area — used by area_x_h method
      // Items with unknown shapeType are excluded (quantity = 0) to match computeGroupTotal
      // which also excludes them. This prevents corrupting rawQuantity during type-change
      // recomputes on legacy items that pre-date the shapeType column.
      if (!shapeType) return { rawQuantity: 0, quantity: 0, unit: scaleUnit };
      const isLengthShape = shapeType === "POLYLINE" || shapeType === "ARC";
      let rawQty: number;
      if (isLengthShape) {
        rawQty = (shapeType === "ARC" ? arcLengthPx(pts) : polylineLength(pts)) * scale;
      } else if (shapeType === "CIRCLE") {
        const r = circleRadiusPx(pts);
        rawQty = Math.PI * r * r * scale * scale;
      } else {
        // RECTANGLE and POLYGON both use polygon area
        rawQty = polygonArea(pts) * scale * scale;
      }

      const method = additionalParams?.volumeMethod ?? "area_x_h";
      // height and breadth are stored as feet+inches; convert to the drawing's scale unit
      const ftToUnit = scaleUnit === "ft" ? 1 : 0.3048;
      const h = additionalParams?.height;
      const heightFt = h ? (h.ft ?? 0) + (h.in ?? 0) / 12 : 0;
      const heightInUnit = heightFt * ftToUnit;

      if (method === "lbh") {
        const b = additionalParams?.breadth;
        const breadthFt = b ? (b.ft ?? 0) + (b.in ?? 0) / 12 : 0;
        const breadthInUnit = breadthFt * ftToUnit;
        if (!breadthInUnit || !heightInUnit) {
          const missing = !breadthInUnit && !heightInUnit ? "breadth+height" : !breadthInUnit ? "breadth" : "height";
          return { rawQuantity: rawQty, quantity: rawQty * multiplier, unit: `${scaleUnit} (set ${missing})` };
        }
        return { rawQuantity: rawQty, quantity: rawQty * breadthInUnit * heightInUnit * multiplier, unit: scaleUnit === "ft" ? "cu ft" : "cu m" };
      }

      // area_x_h: expects area-based shape
      if (!heightInUnit) {
        return { rawQuantity: rawQty, quantity: rawQty * multiplier, unit: areaUnit(scaleUnit) + " (set height)" };
      }
      return { rawQuantity: rawQty, quantity: rawQty * heightInUnit * multiplier, unit: scaleUnit === "ft" ? "cu ft" : "cu m" };
    }

    default:
      return { quantity: 0, rawQuantity: 0, unit: scaleUnit };
  }
}

/** Find the effective scale for a set of points on a page.
 *  Uses the centroid of all points for zone lookup so shapes crossing boundaries are handled correctly.
 *  Falls back to the page scale when no zone contains the centroid. */
export function effectiveScale(
  points: Point[],
  pageScale: number | null,
  pageScaleUnit: string,
  scaleZones: Array<{ x: number; y: number; width: number; height: number; scale: number; scaleUnit: string }>
): { scale: number; scaleUnit: string } | null {
  if (points.length === 0) {
    if (pageScale && pageScale > 0) return { scale: pageScale, scaleUnit: pageScaleUnit };
    return null;
  }
  // Centroid of all points
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  for (const z of scaleZones) {
    if (cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height) {
      return { scale: z.scale, scaleUnit: z.scaleUnit };
    }
  }
  if (pageScale && pageScale > 0) return { scale: pageScale, scaleUnit: pageScaleUnit };
  return null;
}

/** Like effectiveScale but computes a length-weighted average scale for POLYLINE shapes by
 *  looking up the zone at each segment's midpoint. Gives accurate results when a polyline
 *  crosses zones with different scales. Returns the same type as effectiveScale so it can
 *  be used as a drop-in replacement for POLYLINE shapes. Non-POLYLINE shapes should still
 *  use effectiveScale (centroid is appropriate for areas and circles). */
export function perSegmentEffectiveScale(
  pts: Point[],
  pageScale: number | null,
  pageScaleUnit: string,
  scaleZones: Array<{ x: number; y: number; width: number; height: number; scale: number; scaleUnit: string }>
): { scale: number; scaleUnit: string } | null {
  const fallback = effectiveScale(pts, pageScale, pageScaleUnit, scaleZones);
  if (!fallback || scaleZones.length === 0 || pts.length < 2) return fallback;
  let totalPx = 0;
  let totalReal = 0;
  for (let i = 1; i < pts.length; i++) {
    const mid: Point = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
    const sr = effectiveScale([mid], pageScale, pageScaleUnit, scaleZones);
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const segPx = Math.sqrt(dx * dx + dy * dy);
    totalPx += segPx;
    totalReal += segPx * (sr?.scale ?? fallback.scale);
  }
  if (totalPx === 0) return fallback;
  // Return a synthetic scale = totalReal / totalPx so that polylineLength(pts) * scale = totalReal
  return { scale: totalReal / totalPx, scaleUnit: fallback.scaleUnit };
}

/** Area-weighted scale for closed shapes (RECTANGLE, POLYGON, CIRCLE, ARC) that may cross
 *  zone boundaries.  Computes the fraction of the shape's axis-aligned bounding box that
 *  overlaps each zone, then returns the area-weighted average scale.  For CIRCLE, the true
 *  circular bounding box [cx±r, cy±r] is used rather than the raw two-point bbox.
 *  Falls back to centroid lookup when there are no zones or the shape is a point. */
export function boundingBoxWeightedScale(
  pts: Point[],
  pageScale: number | null,
  pageScaleUnit: string,
  scaleZones: Array<{ x: number; y: number; width: number; height: number; scale: number; scaleUnit: string }>,
  shapeType?: string | null
): { scale: number; scaleUnit: string } | null {
  const fallback = effectiveScale(pts, pageScale, pageScaleUnit, scaleZones);
  if (!fallback || scaleZones.length === 0 || pts.length === 0) return fallback;

  let minX: number, maxX: number, minY: number, maxY: number;
  if (shapeType === "CIRCLE" && pts.length >= 2) {
    const r = Math.sqrt((pts[1].x - pts[0].x) ** 2 + (pts[1].y - pts[0].y) ** 2);
    minX = pts[0].x - r; maxX = pts[0].x + r;
    minY = pts[0].y - r; maxY = pts[0].y + r;
  } else {
    minX = Math.min(...pts.map(p => p.x)); maxX = Math.max(...pts.map(p => p.x));
    minY = Math.min(...pts.map(p => p.y)); maxY = Math.max(...pts.map(p => p.y));
  }

  const bboxArea = (maxX - minX) * (maxY - minY);
  if (bboxArea === 0) return fallback;

  let totalWeight = 0;
  let weightedScale = 0;
  for (const z of scaleZones) {
    const ix1 = Math.max(minX, z.x), ix2 = Math.min(maxX, z.x + z.width);
    const iy1 = Math.max(minY, z.y), iy2 = Math.min(maxY, z.y + z.height);
    if (ix2 <= ix1 || iy2 <= iy1) continue;
    const overlap = (ix2 - ix1) * (iy2 - iy1);
    weightedScale += overlap * z.scale;
    totalWeight += overlap;
  }

  // Any part of the bbox not covered by a zone uses the page scale.
  const uncovered = bboxArea - totalWeight;
  if (uncovered > 0 && pageScale && pageScale > 0) {
    weightedScale += uncovered * pageScale;
    totalWeight += uncovered;
  }

  if (totalWeight === 0) return fallback;
  return { scale: weightedScale / totalWeight, scaleUnit: fallback.scaleUnit };
}
