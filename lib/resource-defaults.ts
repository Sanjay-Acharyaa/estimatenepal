import { ResourceCategory } from "@prisma/client";

export interface DefaultResource {
  name: string;
  category: ResourceCategory;
  unit: string;
  unitRate: number;
  wastagePercent: number;
  notes?: string;
}

// Nepal market reference rates (NPR). Engineers adjust these to local district rates.
export const DEFAULT_RESOURCES: DefaultResource[] = [
  // Cement
  { name: "PPC Cement (Bag 50kg)", category: "CEMENT", unit: "bag", unitRate: 850, wastagePercent: 3, notes: "Portland Pozzolana Cement" },
  { name: "OPC Cement (Bag 50kg)", category: "CEMENT", unit: "bag", unitRate: 870, wastagePercent: 3, notes: "Ordinary Portland Cement" },

  // Fine Aggregate
  { name: "River Sand (Fine)", category: "FINE_AGGREGATE", unit: "cft", unitRate: 75, wastagePercent: 5 },
  { name: "Crushed Sand (Fine)", category: "FINE_AGGREGATE", unit: "cft", unitRate: 65, wastagePercent: 5 },

  // Coarse Aggregate
  { name: "Gravel / Stone Chips (20mm)", category: "COARSE_AGGREGATE", unit: "cft", unitRate: 85, wastagePercent: 5 },
  { name: "Gravel / Stone Chips (40mm)", category: "COARSE_AGGREGATE", unit: "cft", unitRate: 80, wastagePercent: 5 },

  // Masonry
  { name: "Brick (Class A)", category: "MASONRY", unit: "nos", unitRate: 18, wastagePercent: 5 },
  { name: "Brick (Class B)", category: "MASONRY", unit: "nos", unitRate: 15, wastagePercent: 5 },
  { name: "Stone (Rubble)", category: "MASONRY", unit: "cft", unitRate: 55, wastagePercent: 5 },

  // Steel
  { name: "TMT Steel Bar 8mm", category: "STEEL", unit: "kg", unitRate: 105, wastagePercent: 3, notes: "Unit weight: 0.395 kg/m" },
  { name: "TMT Steel Bar 10mm", category: "STEEL", unit: "kg", unitRate: 105, wastagePercent: 3, notes: "Unit weight: 0.617 kg/m" },
  { name: "TMT Steel Bar 12mm", category: "STEEL", unit: "kg", unitRate: 103, wastagePercent: 3, notes: "Unit weight: 0.888 kg/m" },
  { name: "TMT Steel Bar 16mm", category: "STEEL", unit: "kg", unitRate: 103, wastagePercent: 3, notes: "Unit weight: 1.578 kg/m" },
  { name: "TMT Steel Bar 20mm", category: "STEEL", unit: "kg", unitRate: 100, wastagePercent: 3, notes: "Unit weight: 2.466 kg/m" },
  { name: "TMT Steel Bar 25mm", category: "STEEL", unit: "kg", unitRate: 100, wastagePercent: 3, notes: "Unit weight: 3.854 kg/m" },
  { name: "Binding Wire", category: "STEEL", unit: "kg", unitRate: 120, wastagePercent: 5 },

  // Timber
  { name: "Sal Wood (Shorea robusta)", category: "TIMBER", unit: "cft", unitRate: 3500, wastagePercent: 10 },
  { name: "Pine Wood (Salla)", category: "TIMBER", unit: "cft", unitRate: 2200, wastagePercent: 10 },

  // Skilled Labour
  { name: "Mason (First Class)", category: "LABOUR_SKILLED", unit: "day", unitRate: 1200, wastagePercent: 0 },
  { name: "Carpenter (First Class)", category: "LABOUR_SKILLED", unit: "day", unitRate: 1200, wastagePercent: 0 },
  { name: "Bar Bender / Steel Fixer", category: "LABOUR_SKILLED", unit: "day", unitRate: 1100, wastagePercent: 0 },
  { name: "Plumber (First Class)", category: "LABOUR_SKILLED", unit: "day", unitRate: 1200, wastagePercent: 0 },
  { name: "Electrician (First Class)", category: "LABOUR_SKILLED", unit: "day", unitRate: 1200, wastagePercent: 0 },
  { name: "Painter (First Class)", category: "LABOUR_SKILLED", unit: "day", unitRate: 1100, wastagePercent: 0 },

  // Unskilled Labour
  { name: "Unskilled Labour (Male)", category: "LABOUR_UNSKILLED", unit: "day", unitRate: 800, wastagePercent: 0 },
  { name: "Unskilled Labour (Female)", category: "LABOUR_UNSKILLED", unit: "day", unitRate: 750, wastagePercent: 0 },

  // Equipment
  { name: "Concrete Mixer (0.14 cum)", category: "EQUIPMENT", unit: "hour", unitRate: 350, wastagePercent: 0 },
  { name: "Vibrator (Needle Type)", category: "EQUIPMENT", unit: "hour", unitRate: 150, wastagePercent: 0 },
  { name: "Water Pump (1.5HP)", category: "EQUIPMENT", unit: "hour", unitRate: 120, wastagePercent: 0 },
  { name: "Scaffolding (Bamboo)", category: "EQUIPMENT", unit: "cft", unitRate: 8, wastagePercent: 20 },
  { name: "Form Work (Plywood 18mm)", category: "EQUIPMENT", unit: "sqft", unitRate: 65, wastagePercent: 15 },
];
