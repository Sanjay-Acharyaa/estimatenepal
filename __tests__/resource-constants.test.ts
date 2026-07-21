/**
 * Invariant tests for resource-constants and seed data.
 * These catch sync drift between RESOURCE_UNITS, CATEGORY_DEFAULT_UNIT,
 * and DEFAULT_RESOURCES before it reaches production.
 */

import { RESOURCE_CATEGORIES, RESOURCE_UNITS, CATEGORY_DEFAULT_UNIT } from "../lib/resource-constants";
import { DEFAULT_RESOURCES } from "../lib/resource-defaults";

describe("RESOURCE_UNITS coverage", () => {
  it("has an entry for every RESOURCE_CATEGORIES value", () => {
    for (const cat of RESOURCE_CATEGORIES) {
      expect(RESOURCE_UNITS).toHaveProperty(cat.value);
      expect(Array.isArray(RESOURCE_UNITS[cat.value])).toBe(true);
      expect(RESOURCE_UNITS[cat.value].length).toBeGreaterThan(0);
    }
  });

  it("has no empty unit lists", () => {
    for (const [, units] of Object.entries(RESOURCE_UNITS)) {
      expect(units.length).toBeGreaterThan(0);
      for (const u of units) {
        expect(typeof u).toBe("string");
        expect(u.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("CATEGORY_DEFAULT_UNIT sync with RESOURCE_UNITS", () => {
  it("every default unit is present in its category's RESOURCE_UNITS list", () => {
    for (const [cat, defaultUnit] of Object.entries(CATEGORY_DEFAULT_UNIT)) {
      const allowed = RESOURCE_UNITS[cat];
      expect(allowed).toBeDefined();
      expect(allowed).toContain(defaultUnit);
    }
  });

  it("covers every RESOURCE_CATEGORIES value", () => {
    for (const cat of RESOURCE_CATEGORIES) {
      expect(CATEGORY_DEFAULT_UNIT).toHaveProperty(cat.value);
    }
  });
});

describe("DEFAULT_RESOURCES seed data sync with RESOURCE_UNITS", () => {
  it("every seeded resource unit is valid for its category", () => {
    const failures: string[] = [];
    for (const r of DEFAULT_RESOURCES) {
      const allowed = RESOURCE_UNITS[r.category];
      if (!allowed) {
        failures.push(`${r.name}: category "${r.category}" not in RESOURCE_UNITS`);
      } else if (!allowed.includes(r.unit)) {
        failures.push(`${r.name} (${r.category}): unit "${r.unit}" not in [${allowed.join(", ")}]`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Seed data unit mismatches:\n  ${failures.join("\n  ")}`);
    }
  });
});
