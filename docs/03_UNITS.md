# Unit System — Complete Specification

> This is the single source of truth for all unit-related decisions. Read this before touching any canvas input, scale dialog, BOQ computation, or export route.

---

## Core rule

**The unit system selected on a Project is the source of truth for EVERYTHING downstream.**

| `Project.unitSystem` | Canvas inputs | Scale presets | Quantity display | Exports |
|---|---|---|---|---|
| `IMPERIAL` | Feet + inches spinners | Architectural + Civil ft presets | ft, sq ft, cu ft | ft-based unit labels |
| `METRIC` | Single decimal meter field | Metric ratio presets (1:100 etc.) | m, sq m, cu m | metric unit labels |

Changing the project unit setting must cascade immediately to every downstream surface. There is no "mixed mode" within a single project.

---

## Canonical storage rule — the most important rule in this file

**Feet is always the internal wire format. Meters is always a display/input format.**

`AdditionalParams` in `TakeoffItem.toolData` stores all dimensions as `{ ft, in }` objects:
- `wall.heightFt` / `wall.heightIn`
- `height.ft` / `height.in`
- `breadth.ft` / `breadth.in`
- `spacing.ft` / `spacing.in`
- `pieceSize.sideAFt` / `pieceSize.sideAIn`

When a METRIC project user types "3.5 m" in the canvas toolbar, the UI converts it to feet before saving:
```
{ ft: 11.4829, in: 0 }   // 3.5 m converted to feet
```

`computeQuantity()` in `lib/takeoff.ts` reads the stored feet value and applies:
```typescript
const ftToUnit = scaleUnit === "ft" ? 1 : 0.3048;
```
This converts the stored-feet dimension to the page's native unit at compute time.

**Never change the field names** (`heightFt`, `spacingFt`, etc.) — they describe the storage format, not the display label. Renaming them would corrupt every existing TakeoffItem.

**Never change the storage format to native units** — the conversion infrastructure already works. Changing storage would require migrating every TakeoffItem row.

---

## DrawingPage.scaleUnit

`scaleUnit` on each `DrawingPage` drives: `areaUnit()`, volume unit, `computeQuantity()` output unit, and BOQ unit labels.

**Rule:** `scaleUnit` must match the project's unit system.
- `project.unitSystem = IMPERIAL` → `scaleUnit = "ft"`
- `project.unitSystem = METRIC` → `scaleUnit = "m"`

**Schema default:** `"ft"` (safe fallback — fixed from the original `"m"` default which caused wrong conversions on imperial projects).

**When creating a new DrawingPage server-side**, always set `scaleUnit` from the project:
```typescript
scaleUnit: project.unitSystem === "METRIC" ? "m" : "ft"
```

Do not rely on the schema default for new pages — always derive from the project.

---

## Scale math

### Imperial scale presets (`lib/scale.ts` — existing)

Scale value stored as `ft/px` (real-world feet per pixel at RENDER_DPI = 144):
```
scale_ft_per_px = ftPerDrawingInch / RENDER_DPI
```

`presetToFtPerPx(preset)` handles this conversion. `findPresetLabel(scale, "ft")` does the reverse lookup.

### Metric scale presets (to be added in Phase E-1)

At `RENDER_DPI = 144` (PDF.js renders at 144 px/inch = 72 DPI × scale factor 2):
- 1 inch on paper = 144 pixels
- 1 mm on paper = 144 / 25.4 ≈ 5.6693 pixels

For a 1:N scale drawing, 1 mm paper = N mm real = N/1000 m real:
```
scale_m_per_px = (N / 1000) / (144 / 25.4)
               = N × 25.4 / (1000 × 144)
               = N × 0.000176389
```

| Preset label | N | scale (m/px) |
|---|---|---|
| 1:20 | 20 | 0.003528 |
| 1:25 | 25 | 0.004410 |
| 1:50 | 50 | 0.008819 |
| 1:100 | 100 | 0.017639 |
| 1:200 | 200 | 0.035278 |
| 1:500 | 500 | 0.088194 |
| 1:1000 | 1000 | 0.176389 |
| 1:2500 | 2500 | 0.440972 |

The new `presetToMPerPx(ratio: number): number` function:
```typescript
export function presetToMPerPx(ratio: number): number {
  return (ratio * 25.4) / (1000 * RENDER_DPI);
}
```

`findPresetLabel` must be extended to handle metric: when `scaleUnit === "m"`, check against metric presets using the same ±0.1% tolerance.

### Manual calibration (both units)
```typescript
scale = knownRealLength / pixelLength   // realLength in ft or m depending on scaleUnit
```
`computeScale()` in `lib/scale.ts` already handles this — it is unit-agnostic. The calibration dialog just needs to show the correct input label (ft/in or m) based on `project.unitSystem`.

---

## Unit flow through the system

```
1. User sets Project.unitSystem = METRIC (or IMPERIAL)
        ↓
2. New DrawingPage created → server sets scaleUnit = "m" (or "ft")
        ↓
3. Scale dialog shows metric presets (1:100 etc.) + decimal meter input
   (or imperial presets + ft/in input for IMPERIAL)
        ↓
4. Canvas toolbar shows:
   METRIC  → single decimal meter field for height/breadth/spacing
   IMPERIAL → existing ft + in spinners (no change)
        ↓
5. UI converts meter input to feet before saving TakeoffItem.toolData
   (IMPERIAL projects save directly as feet — no conversion)
        ↓
6. computeQuantity(toolData, scale, scaleUnit) → { quantity, unit: "sq m" or "sq ft" }
        ↓
7. computeBOQ() → reads quantities, converts as needed to match rate units
   (DUDBC rates are metric — quantities from imperial projects are converted to metric for pricing)
        ↓
8. BOQ display → shows sq m, cu m, Rm. (METRIC) or sq ft, cu ft, ft (IMPERIAL)
        ↓
9. All 6 export routes → unit column labels derived from project.unitSystem, not hardcoded
```

---

## Conversion factors (`lib/unit-conversions.ts` — do not change)

| Pair | Factor | Source |
|---|---|---|
| 1 cu ft → cu m | 0.028316846592 | exact SI |
| 1 cu m → cu ft | 35.3146667215 | exact SI |
| 1 sq ft → sq m | 0.09290304 | exact SI |
| 1 sq m → sq ft | 10.7639104167 | exact SI |
| 1 ft → m (Rm.) | 0.3048 | exact SI |
| 1 m → ft | 3.28083989501 | exact SI |
| 1 kg → ton | 0.001 | exact |
| 1 ton → kg | 1000 | exact |

Never hard-code these values elsewhere. Always import from `lib/unit-conversions.ts`.

---

## DUDBC rate units (always metric)

DUDBC rates are published in metric units regardless of the project's unit system:
- Linear items: `Rm.` (running metre)
- Area items: `Sq.m.`
- Volume items: `Cu.m.`

When an IMPERIAL project's quantities are priced against DUDBC rates, `computeBOQ()` converts quantities from imperial to metric using `getConversionFactor()`. **Rates are never altered — only quantities are converted.**

---

## What NOT to do

- Never hardcode unit labels (e.g. `"sq ft"` as a string literal) — always derive from `project.unitSystem`, `page.scaleUnit`, or `takeoffItem.unit`
- Never rename `AdditionalParams` fields like `heightFt`, `spacingFt` — they are internal storage labels
- Never convert rates — only quantities are converted at BOQ compute time
- Never set `scaleUnit` from the schema default for new pages — always derive from `project.unitSystem`
- Never add a "mixed unit" mode — one project, one unit system, everywhere
