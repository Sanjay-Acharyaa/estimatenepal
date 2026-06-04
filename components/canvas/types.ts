export type Point = { x: number; y: number };

export type Annotation =
  | { id: string; type: "pen";       points: number[]; color: string; strokeWidth: number }
  | { id: string; type: "text";      x: number; y: number; text: string; color: string; fontSize: number }
  | { id: string; type: "highlight"; x: number; y: number; width: number; height: number; color: string }
  | { id: string; type: "arrow";     x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number }
  | { id: string; type: "xline";    x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number };

export type TakeoffItem = {
  id: string;
  pageId: string;
  groupId: string | null;
  label: string;
  toolType: string;
  shapeType: string | null;
  toolData: { points: Point[] };
  rawQuantity: number;
  quantity: number;
  unit: string;
  scaleUsed: number;
  isLocked: boolean;
  version: number;
  wastagePct: number;
  siteLocation: string | null;
  measuredDate: string | null;
  notes: string | null;
  group?: { id: string; name: string; colour: string; type: string; isLocked: boolean; isVisible: boolean } | null;
};
