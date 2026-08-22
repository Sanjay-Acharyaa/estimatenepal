# Backlog

> Defects and improvements discovered mid-phase. All entries are triaged before the next phase begins. Entries are sorted by severity: Critical → High → Medium → Low.

---

## Critical

| # | Discovered | Description | Affected phase |
|---|---|---|---|
| BL-001 | 2026-08-22 | `DrawingPage.scaleUnit` defaulted to `"m"` — new pages on IMPERIAL projects got wrong scaleUnit, causing incorrect unit conversions in `computeQuantity()` (e.g. `ftToUnit` applied 0.3048 when it should be 1). Fixed in E-0 via SQL ALTER TABLE. | E-0 (fixed) |

---

## High

| # | Discovered | Description | Affected phase |
|---|---|---|---|
| BL-002 | 2026-08-22 | Assembly UI is partial — `Assembly` and `AssemblyGroup` models are built and seeded, but the browser/apply/save UI is incomplete. Users cannot use assemblies. | E-3 |
| BL-003 | 2026-08-22 | Canvas toolbar dimension inputs (height, breadth, spacing) use ft+in spinners regardless of `project.unitSystem`. METRIC project users must mentally convert meters to feet. | E-1 |
| BL-004 | 2026-08-22 | `findPresetLabel()` in `lib/scale.ts` returns `null` for any `scaleUnit !== "ft"` — metric scale calibrations show raw `scale m/px` value instead of a human-readable preset label (e.g. "1:100"). | E-1 |
| BL-005 | 2026-08-22 | No metric scale presets in `lib/scale.ts` — METRIC projects have no preset list in the scale dialog, forcing manual calibration every time. | E-1 |

---

## Medium

| # | Discovered | Description | Affected phase |
|---|---|---|---|
| BL-006 | 2026-08-22 | Export routes (6 total) may have hardcoded unit column labels — not yet verified. If confirmed, all 6 need to derive unit labels from `project.unitSystem`. | E-1 |
| BL-007 | 2026-08-22 | Socket.io auth flow not documented — auth middleware in `server.js` described in SPEC.md but not independently verified or tested for bypass. Security audit needed. | E-4 |
| BL-008 | 2026-08-22 | Rate import (xlsx) does not have documented MIME type verification or file size limit enforcement — needs audit against the rules in docs/10_SECURITY.md. | E-5 |

---

## Low

| # | Discovered | Description | Affected phase |
|---|---|---|---|
| BL-009 | 2026-08-22 | `Project.unitSystem` toggle is not visible on the project creation or settings UI — users cannot set or change the unit system without a database edit. | E-1 |
| BL-010 | 2026-08-22 | Login comparison between Estimation and Bidding not done — best-of-both should be merged into Estimation's login page before Bidding is publicly linked. | E-auth |

---

## Resolved

| # | Resolved | Resolution |
|---|---|---|
| BL-001 | 2026-08-22 | Fixed via `ALTER TABLE DrawingPage MODIFY COLUMN scaleUnit VARCHAR(191) NOT NULL DEFAULT 'ft'` in E-0. `prisma/schema.prisma` updated. |
| BL-011 | 2026-08-22 | Fixed in E-2 Session 1. SSO handshake token (SSO_SECRET, 60s HS256 JWT). Estimation generates → Bidding verifies + upserts user + creates session. |
| BL-012 | 2026-08-22 | Fixed in E-2 Session 1. `bidding_url` added to `CONFIG_DEFAULTS` and `CONFIG_DESCRIPTIONS` in Estimation's `lib/config.ts`. Set via admin settings UI or direct DB write. |
| BL-003 | 2026-08-22 | Fixed in E-1 Session 1: TakeoffGroupDetail.tsx rewritten with meter state + isMetric branching. Stores ft canonical. |
| BL-004 | 2026-08-22 | Fixed in E-1 Session 1: `findPresetLabel()` extended to handle `scaleUnit === "m"` in lib/scale.ts. |
| BL-005 | 2026-08-22 | Fixed in E-1 Session 1: `METRIC_SCALES` array and `presetToMPerPx()` added to lib/scale.ts. |
| BL-009 | 2026-08-22 | Found to be a false entry — toggle already existed in project new and edit forms. No fix needed. |
