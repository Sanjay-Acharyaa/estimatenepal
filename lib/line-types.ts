export const LINE_TYPES = ["MATERIAL", "LABOUR", "EQUIPMENT", "OTHER"] as const;
export type LineType = (typeof LINE_TYPES)[number];
