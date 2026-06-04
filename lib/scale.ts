/** pdfjs render scale used throughout — scale:2 means 72dpi × 2 = 144 px/inch */
export const RENDER_DPI = 144;

export type ScaleGroup = "Architectural" | "Civil";

export type CommonScalePreset = {
  label: string;
  group: ScaleGroup;
  /** Real-world feet per drawing inch. e.g. "1/8\"=1'" → 1/(1/8)=8 */
  ftPerDrawingInch: number;
};

export const COMMON_SCALES: CommonScalePreset[] = [
  // Architectural
  { label: '1/128" = 1\'', group: "Architectural", ftPerDrawingInch: 128 },
  { label: '1/64" = 1\'',  group: "Architectural", ftPerDrawingInch: 64 },
  { label: '1/32" = 1\'',  group: "Architectural", ftPerDrawingInch: 32 },
  { label: '1/16" = 1\'',  group: "Architectural", ftPerDrawingInch: 16 },
  { label: '3/32" = 1\'',  group: "Architectural", ftPerDrawingInch: 32 / 3 },
  { label: '1/8" = 1\'',   group: "Architectural", ftPerDrawingInch: 8 },
  { label: '3/16" = 1\'',  group: "Architectural", ftPerDrawingInch: 16 / 3 },
  { label: '1/4" = 1\'',   group: "Architectural", ftPerDrawingInch: 4 },
  { label: '3/8" = 1\'',   group: "Architectural", ftPerDrawingInch: 8 / 3 },
  { label: '1/2" = 1\'',   group: "Architectural", ftPerDrawingInch: 2 },
  { label: '3/4" = 1\'',   group: "Architectural", ftPerDrawingInch: 4 / 3 },
  { label: '1" = 1\'',     group: "Architectural", ftPerDrawingInch: 1 },
  { label: '1 1/2" = 1\'', group: "Architectural", ftPerDrawingInch: 2 / 3 },
  { label: '3" = 1\'',     group: "Architectural", ftPerDrawingInch: 1 / 3 },
  // Civil
  { label: '1" = 10\'',    group: "Civil", ftPerDrawingInch: 10 },
  { label: '1" = 20\'',    group: "Civil", ftPerDrawingInch: 20 },
  { label: '1" = 30\'',    group: "Civil", ftPerDrawingInch: 30 },
  { label: '1" = 40\'',    group: "Civil", ftPerDrawingInch: 40 },
  { label: '1" = 50\'',    group: "Civil", ftPerDrawingInch: 50 },
  { label: '1" = 60\'',    group: "Civil", ftPerDrawingInch: 60 },
  { label: '1" = 70\'',    group: "Civil", ftPerDrawingInch: 70 },
  { label: '1" = 80\'',    group: "Civil", ftPerDrawingInch: 80 },
  { label: '1" = 90\'',    group: "Civil", ftPerDrawingInch: 90 },
  { label: '1" = 100\'',   group: "Civil", ftPerDrawingInch: 100 },
  { label: '1" = 300\'',   group: "Civil", ftPerDrawingInch: 300 },
  { label: '1" = 500\'',   group: "Civil", ftPerDrawingInch: 500 },
  { label: '1" = 1000\'',  group: "Civil", ftPerDrawingInch: 1000 },
];

/**
 * Convert a common scale preset to a stored scale value (ft/px).
 * At RENDER_DPI px/inch: 1 pixel = 1/RENDER_DPI drawing inches
 * scale_ft_per_px = ftPerDrawingInch / RENDER_DPI
 */
export function presetToFtPerPx(preset: CommonScalePreset): number {
  return preset.ftPerDrawingInch / RENDER_DPI;
}

/** Return the common scale label for a stored ft/px scale, or null if none matches. */
export function findPresetLabel(scale: number, scaleUnit: string): string | null {
  if (scaleUnit !== "ft") return null;
  const match = COMMON_SCALES.find(
    (p) => Math.abs(presetToFtPerPx(p) - scale) < scale * 0.001
  );
  return match?.label ?? null;
}

/** Convert a pixel distance to a real-world measurement using the page scale. */
export function pxToRealWorld(px: number, scale: number): number {
  return px * scale;
}

/** Convert a real-world measurement back to pixels. */
export function realWorldToPx(realWorld: number, scale: number): number {
  if (scale === 0) return 0;
  return realWorld / scale;
}

/**
 * Compute the scale factor (realWorldUnits / px) from a calibration line.
 * @param pixelLength  Length of the drawn reference line in pixels
 * @param realLength   Known real-world length the line represents
 */
export function computeScale(pixelLength: number, realLength: number): number {
  if (pixelLength <= 0) throw new Error("Pixel length must be > 0");
  if (realLength <= 0) throw new Error("Real-world length must be > 0");
  return realLength / pixelLength;
}

/** Human-readable label for the current page scale. */
export function scaleLabel(scale: number, unit: string): string {
  if (scale <= 0) return "Not set";
  const preset = findPresetLabel(scale, unit);
  if (preset) return preset;
  return `${scale.toFixed(6)} ${unit}/px`;
}

export function rectanglesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export const UNIT_LABELS: Record<string, string> = {
  m: "m",
  mm: "mm",
  ft: "ft",
  in: "in",
};
