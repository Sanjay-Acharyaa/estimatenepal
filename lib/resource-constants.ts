// Shared constants for resource categories and display — imported by ResourceLibrary,
// ResourceLineAnalysis, and any future components that need category metadata.

export const RESOURCE_CATEGORIES = [
  { value: "CEMENT",           label: "Cement" },
  { value: "FINE_AGGREGATE",   label: "Fine Aggregate" },
  { value: "COARSE_AGGREGATE", label: "Coarse Aggregate" },
  { value: "MASONRY",          label: "Masonry" },
  { value: "STEEL",            label: "Steel" },
  { value: "TIMBER",           label: "Timber" },
  { value: "LABOUR_SKILLED",   label: "Skilled Labour" },
  { value: "LABOUR_UNSKILLED", label: "Unskilled Labour" },
  { value: "EQUIPMENT",        label: "Equipment" },
  { value: "OTHER",            label: "Other" },
] as const;

export const CAT_COLORS: Record<string, string> = {
  CEMENT:           "bg-gray-100 text-gray-700",
  FINE_AGGREGATE:   "bg-yellow-100 text-yellow-700",
  COARSE_AGGREGATE: "bg-orange-100 text-orange-700",
  MASONRY:          "bg-red-100 text-red-700",
  STEEL:            "bg-blue-100 text-blue-700",
  TIMBER:           "bg-green-100 text-green-700",
  LABOUR_SKILLED:   "bg-purple-100 text-purple-700",
  LABOUR_UNSKILLED: "bg-pink-100 text-pink-700",
  EQUIPMENT:        "bg-cyan-100 text-cyan-700",
  OTHER:            "bg-slate-100 text-slate-700",
};

export const catLabel = (cat: string): string =>
  RESOURCE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
