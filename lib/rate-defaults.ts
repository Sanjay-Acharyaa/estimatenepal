// DUDBC standard default percentages for rate calculation.
// Single source of truth imported by both the API route and the UI panel.
// Update here when Nepal regulatory rates change.

export const RATE_DEFAULTS = {
  overheadPct:        12,   // General management and site infrastructure
  profitPct:          10,   // Contractor profit on direct + overhead
  contingencyPct:      5,   // Reserve for unforeseen conditions (DUDBC standard)
  vatPct:             13,   // Nepal government VAT on construction works
  leadLiftPct:         0,   // Additional haulage; 0 for standard accessible sites
  dryVolumeMortar:   1.30,  // DUDBC wet-to-dry conversion for mortar
  dryVolumeConcrete: 1.54,  // DUDBC wet-to-dry conversion for concrete
} as const;

export type RateDefaultKey = keyof typeof RATE_DEFAULTS;
