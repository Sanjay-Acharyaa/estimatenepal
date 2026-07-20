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
  CEMENT:           "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  FINE_AGGREGATE:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  COARSE_AGGREGATE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MASONRY:          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  STEEL:            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  TIMBER:           "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  LABOUR_SKILLED:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  LABOUR_UNSKILLED: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  EQUIPMENT:        "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  OTHER:            "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
};

export const catLabel = (cat: string): string =>
  RESOURCE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

// Allowed units per category — drives the unit <select> in ResourceLibrary.
// Keep in sync with CATEGORY_DEFAULT_UNIT below (default must appear in this list).
export const RESOURCE_UNITS: Record<string, string[]> = {
  CEMENT:           ["bag", "kg"],
  FINE_AGGREGATE:   ["cft", "m3", "kg"],
  COARSE_AGGREGATE: ["cft", "m3", "kg"],
  MASONRY:          ["nos", "kg"],
  STEEL:            ["kg", "ton", "m"],
  TIMBER:           ["cft", "m3", "m", "nos"],
  LABOUR_SKILLED:   ["day", "hour"],
  LABOUR_UNSKILLED: ["day", "hour"],
  EQUIPMENT:        ["hour", "day", "shift"],
  OTHER:            ["unit", "nos", "kg", "m", "m2", "m3", "cft", "sqft", "rft"],
};

// Default units per category — used by ResourceLibrary form when creating a new resource.
export const CATEGORY_DEFAULT_UNIT: Record<string, string> = {
  CEMENT:           "bag",
  FINE_AGGREGATE:   "cft",
  COARSE_AGGREGATE: "cft",
  MASONRY:          "nos",
  STEEL:            "kg",
  TIMBER:           "cft",
  LABOUR_SKILLED:   "day",
  LABOUR_UNSKILLED: "day",
  EQUIPMENT:        "hour",
  OTHER:            "unit",
};

// Shared badge styles for rate source labels (DUDBC, DISTRICT, CUSTOM).
// Used by CatalogBrowser and RateCatalog to ensure consistent display.
export const SOURCE_BADGE: Record<string, string> = {
  DUDBC:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  DISTRICT: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  CUSTOM:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

// Default wastage % per category — used by ResourceLibrary form when creating a new resource.
export const CATEGORY_DEFAULT_WASTAGE: Record<string, string> = {
  CEMENT:           "3",
  FINE_AGGREGATE:   "5",
  COARSE_AGGREGATE: "5",
  MASONRY:          "5",
  STEEL:            "3",
  TIMBER:           "10",
  LABOUR_SKILLED:   "0",
  LABOUR_UNSKILLED: "0",
  EQUIPMENT:        "0",
  OTHER:            "0",
};
