import type { TakeoffTool } from "@prisma/client";

export type Point = { x: number; y: number };
export type ToolData = { points: Point[] };

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

// Arc length from 3 points (start, end, midpoint-on-arc) using circumscribed circle
function arcLengthPx(pts: Point[]): number {
  if (pts.length < 3) return polylineLength(pts);
  const [A, B, C] = pts;
  const D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
  if (Math.abs(D) < 1e-10) {
    // Collinear — straight line from A to B
    return Math.sqrt((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
  }
  const A2 = A.x ** 2 + A.y ** 2, B2 = B.x ** 2 + B.y ** 2, C2 = C.x ** 2 + C.y ** 2;
  const ux = (A2 * (B.y - C.y) + B2 * (C.y - A.y) + C2 * (A.y - B.y)) / D;
  const uy = (A2 * (C.x - B.x) + B2 * (A.x - C.x) + C2 * (B.x - A.x)) / D;
  const r = Math.sqrt((A.x - ux) ** 2 + (A.y - uy) ** 2);

  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const na1 = norm(Math.atan2(A.y - uy, A.x - ux));
  const na2 = norm(Math.atan2(B.y - uy, B.x - ux));
  const nam = norm(Math.atan2(C.y - uy, C.x - ux));

  // CCW sweep from na1 to na2
  let ccwSweep = na2 - na1;
  if (ccwSweep < 0) ccwSweep += 2 * Math.PI;

  // Is midpoint on the CCW arc from na1 to na2?
  let namRel = nam - na1;
  if (namRel < 0) namRel += 2 * Math.PI;

  const sweep = namRel <= ccwSweep ? ccwSweep : 2 * Math.PI - ccwSweep;
  return r * sweep;
}

function areaUnit(scaleUnit: string): string {
  if (scaleUnit === "ft") return "sq ft";
  if (scaleUnit === "m") return "sq m";
  return `${scaleUnit}²`;
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
      } else if (shapeType === "RECTANGLE") {
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
      } else if (shapeType === "RECTANGLE") {
        rawPx = perimeterOfPolygon(pts);
      } else {
        rawPx = polylineLength(pts);
      }
      const lengthReal = rawPx * scale;

      const sp = additionalParams?.spacing;
      const spacingFt = sp ? (sp.ft ?? 0) + (sp.in ?? 0) / 12 : 0;
      if (!spacingFt) {
        // No spacing set — show raw length with hint so user knows to set it
        return { rawQuantity: lengthReal, quantity: lengthReal * multiplier, unit: `${scaleUnit} (set spacing)` };
      }
      const count = Math.ceil(lengthReal / spacingFt);
      return { rawQuantity: lengthReal, quantity: count * multiplier, unit: "each" };
    }

    case "AREA": {
      let rawPx2: number;
      if (shapeType === "CIRCLE") {
        const r = circleRadiusPx(pts);
        rawPx2 = Math.PI * r * r;
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
      } else if (shapeType === "RECTANGLE") {
        perimPx = perimeterOfPolygon(pts);
      } else {
        perimPx = polylineLength(pts);
      }
      const perimeterReal = perimPx * scale;
      const wall = additionalParams?.wall;
      const wallH = wall?.enabled ? (wall.heightFt ?? 0) + (wall.heightIn ?? 0) / 12 : 8;
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
      // rawQuantity always stores the shape's intrinsic measurement so params can change later:
      //   POLYLINE / ARC → length (ft)
      //   RECTANGLE / CIRCLE → area (sq ft)
      const isLengthShape = shapeType === "POLYLINE" || shapeType === "ARC" || !shapeType;
      let rawQty: number;
      if (isLengthShape) {
        rawQty = polylineLength(pts) * scale;
      } else if (shapeType === "CIRCLE") {
        const r = circleRadiusPx(pts);
        rawQty = Math.PI * r * r * scale * scale;
      } else {
        rawQty = polygonArea(pts) * scale * scale;
      }

      const method = additionalParams?.volumeMethod ?? "area_x_h";
      const h = additionalParams?.height;
      const heightFt = h ? (h.ft ?? 0) + (h.in ?? 0) / 12 : 0;

      if (method === "lbh") {
        const b = additionalParams?.breadth;
        const breadthFt = b ? (b.ft ?? 0) + (b.in ?? 0) / 12 : 0;
        if (!breadthFt || !heightFt) {
          const missing = !breadthFt && !heightFt ? "breadth+height" : !breadthFt ? "breadth" : "height";
          return { rawQuantity: rawQty, quantity: rawQty * multiplier, unit: `${scaleUnit} (set ${missing})` };
        }
        return { rawQuantity: rawQty, quantity: rawQty * breadthFt * heightFt * multiplier, unit: scaleUnit === "ft" ? "cu ft" : "cu m" };
      }

      // area_x_h: expects area-based shape
      if (!heightFt) {
        return { rawQuantity: rawQty, quantity: rawQty * multiplier, unit: areaUnit(scaleUnit) + " (set height)" };
      }
      return { rawQuantity: rawQty, quantity: rawQty * heightFt * multiplier, unit: scaleUnit === "ft" ? "cu ft" : "cu m" };
    }

    default:
      return { quantity: 0, rawQuantity: 0, unit: scaleUnit };
  }
}

/** Find the effective scale for a point on a page.
 *  Checks scale zones first (most specific), then falls back to the page scale. */
export function effectiveScale(
  point: Point,
  pageScale: number | null,
  pageScaleUnit: string,
  scaleZones: Array<{ x: number; y: number; width: number; height: number; scale: number; scaleUnit: string }>
): { scale: number; scaleUnit: string } | null {
  for (const z of scaleZones) {
    if (
      point.x >= z.x && point.x <= z.x + z.width &&
      point.y >= z.y && point.y <= z.y + z.height
    ) {
      return { scale: z.scale, scaleUnit: z.scaleUnit };
    }
  }
  if (pageScale && pageScale > 0) return { scale: pageScale, scaleUnit: pageScaleUnit };
  return null;
}
