# Build Roadmap

> Phases E-0 through E-6. The Definition of Done (DoD) for each phase is the audit checklist used at session end. Re-read DoD from this file — not from PROGRESS.md.

---

## Code quality checklist (applies to every phase)

Run these checks at the end of every session before marking any phase COMPLETE or PARTIAL:

- [ ] `tsc --noEmit` → 0 errors
- [ ] No hardcoded unit labels, strings, or magic numbers (every value derives from data or constants)
- [ ] Every new API route calls `withTenantGuard()`
- [ ] Every new API route validates input with Zod
- [ ] Every new API route applies the appropriate rate limiter
- [ ] Every Excel cell written through `sanitizeCell()`
- [ ] `invalidateBOQCache(projectId)` called after every quantity/rate write
- [ ] No `console.log` left in production code paths
- [ ] No `any` types added without a comment explaining why

---

## Phase E-0 — Documentation and Foundation
**Status:** COMPLETE  
**Session:** 1

### Scope
- Create CLAUDE.md with AI guardrails, rules, schema change procedure, end-of-session checklist
- Create docs/00_MASTER_INDEX.md, 02_DATABASE.md, 03_UNITS.md, 10_SECURITY.md, 14_BUILD_ROADMAP.md, PROGRESS.md, BACKLOG.md
- Fix `DrawingPage.scaleUnit` schema default from `"m"` to `"ft"` (SQL ALTER TABLE)

### Definition of Done
- [ ] CLAUDE.md exists at project root with all rules, schema change procedure, end-of-session checklist
- [ ] docs/00_MASTER_INDEX.md exists and points to all docs
- [ ] docs/02_DATABASE.md exists with the `prisma migrate dev` / `prisma db push` ban and raw SQL procedure
- [ ] docs/03_UNITS.md exists with canonical storage rule, scale math, metric presets table, unit flow
- [ ] docs/10_SECURITY.md exists with all 13 security rules
- [ ] docs/14_BUILD_ROADMAP.md (this file) exists with phases E-0 through E-6
- [ ] docs/PROGRESS.md exists showing current phase status
- [ ] docs/BACKLOG.md exists with known bugs pre-loaded
- [ ] `DrawingPage.scaleUnit` schema default changed from `"m"` to `"ft"` via raw SQL — logged in PROGRESS.md
- [ ] `prisma/schema.prisma` updated to reflect new default

---

## Phase E-1 — Dual Unit Support (Meters + Feet)
**Status:** COMPLETE

### Scope
All six surfaces that need work to make meters work end-to-end. The conversion math is already correct. Only the UI layer and a few server-side defaults need changing.

**Surface 1 — Project unit preference UI**
- Project creation form: add visible "Unit System" toggle — Imperial (ft) / Metric (m)
- Project settings page: allow changing unit system (with warning if project has existing items)
- `Project.unitSystem` already exists in schema

**Surface 2 — DrawingPage scaleUnit from project**
- When creating a new DrawingPage, server sets `scaleUnit` from `project.unitSystem`
- Remove reliance on schema default — always derive explicitly

**Surface 3 — Scale dialog metric support**
- Add metric scale preset group to `lib/scale.ts`: `CommonScalePreset[]` with ratio-based labels (1:20, 1:25, 1:50, 1:100, 1:200, 1:500, 1:1000, 1:2500)
- Add `presetToMPerPx(ratio: number): number` function
- Extend `findPresetLabel()` to handle `scaleUnit === "m"` — check against metric presets
- Scale calibration dialog: show meter input (decimal) for METRIC projects, ft/in for IMPERIAL

**Surface 4 — Canvas toolbar metric inputs**
- For VOLUME, VERTICAL_WALL_AREA, COUNT_BY_DISTANCE groups on METRIC projects:
  - Replace ft + in spinners with a single decimal meter input
  - Convert meters → feet before writing to `TakeoffItem.toolData` (`AdditionalParams`)
  - On load: convert stored feet → meters for display in the meter input field
- For IMPERIAL projects: existing ft + in spinners unchanged

**Surface 5 — Quantity display verification**
- Verify that `computeQuantity()` output units (`"sq m"`, `"cu m"`, `"m"`) flow correctly to group total display, BOQ view, and estimate sheet
- Fix any hardcoded unit label strings found during verification

**Surface 6 — Export routes**
- Pass `project.unitSystem` into all 6 export routes
- Replace any hardcoded unit column strings (`"Sq.ft."`, `"Cu.ft."`, `"Rft."`) with values derived from `project.unitSystem`
- Metric exports: `"Sq.m."`, `"Cu.m."`, `"Rm."`
- Imperial exports: `"Sq.ft."`, `"Cu.ft."`, `"Rft."`

### Definition of Done
- [ ] Project creation and settings forms show the Imperial/Metric toggle
- [ ] New DrawingPages are created with `scaleUnit` derived from `project.unitSystem` (not the schema default)
- [ ] `lib/scale.ts` has `METRIC_SCALES` preset array with all 8 ratio presets and correct `m/px` values
- [ ] `presetToMPerPx(ratio)` function exists and is correct (verified against the formula in docs/03_UNITS.md)
- [ ] `findPresetLabel()` returns the correct label for metric scales
- [ ] Scale calibration dialog shows meter input for METRIC, ft+in for IMPERIAL
- [ ] Canvas toolbar shows decimal meter field for METRIC projects (height/breadth/spacing)
- [ ] Canvas toolbar converts meter input to feet before saving `toolData`
- [ ] Canvas toolbar converts stored feet to meters for display in METRIC projects
- [ ] Unit tests in `__tests__/unit-conversions.test.ts` cover meter↔feet round-trips for all AdditionalParams dimensions
- [ ] Unit tests in `__tests__/takeoff.test.ts` cover METRIC project quantity computation for all 6 tool types
- [ ] All 6 export routes derive unit column labels from `project.unitSystem` — no hardcoded strings
- [ ] Quantity display in BOQ view shows correct units for METRIC and IMPERIAL projects
- [ ] `tsc --noEmit` → 0 errors
- [ ] No `console.log` in production paths

---

## Phase E-auth — Unified Login
**Status:** PARTIAL

### Scope
- Compare Estimation and Bidding login/register pages — take best UI/UX from each into Estimation
- Add "Go to Bidding" button in Estimation navigation (post-login only)
- Confirm JWT secret is shared between both apps (same cookie domain)

### Definition of Done
- [ ] Estimation login page incorporates best elements from both apps' designs
- [ ] "Go to Bidding" navigation button exists in Estimation dashboard nav
- [ ] Clicking the button opens Bidding without a second login prompt (shared JWT cookie)
- [ ] Both apps use the same `NEXTAUTH_SECRET`
- [ ] Both apps use the same cookie domain

---

## Phase E-2 — Integration Bridge
**Status:** PLANNED

### Scope
- Add `estimationProjectId` (nullable) to Bidding's Tender model
- "Create Tender from this Project" button on Estimation project page
- Opens Bidding's new-tender form pre-populated with project name, BOQ groups, and quantities
- "View Source Estimation" link on Bidding tender page (when `estimationProjectId` is set)

### Definition of Done
- [ ] `bid_Tender.estimationProjectId` column exists (nullable, references Estimation's `Project.id`)
- [ ] "Create Tender" button on Estimation project detail page
- [ ] Clicking button opens Bidding new-tender form with pre-populated BOQ data
- [ ] "View Source Estimation" link visible on Bidding tender when `estimationProjectId` is set
- [ ] Cross-app navigation works without requiring a second login
- [ ] Tenant guard verified: a user can only create a tender from a project their org owns

---

## Phase E-3 — Assembly UI Completion
**Status:** PLANNED

### Scope
- `Assembly` and `AssemblyGroup` models are built; the UI is partial
- Complete the assembly library browser (list, search, preview)
- Apply-to-project flow: applying an assembly creates TakeoffGroups on the selected project
- Assembly edit and save from project (save current groups as a new assembly)

### Definition of Done
- [ ] Assembly library page shows all org assemblies with search and category filter
- [ ] Preview panel shows the group structure (types, colours, rate links) before applying
- [ ] Apply flow creates TakeoffGroups on the target project with correct `disciplineId`, `type`, `rateItemId`
- [ ] "Save as Assembly" button on project saves current groups as a new assembly
- [ ] `withTenantGuard` on all assembly routes
- [ ] `tsc --noEmit` → 0 errors

---

## Phase E-4 — Socket.io Security Audit
**Status:** PLANNED

### Scope
- Audit every Socket.io event handler against the rules in docs/10_SECURITY.md section 8
- Verify auth middleware fires before any event handler on connection
- Verify `joinedRooms` guard is present on every shape/lock relay event
- Verify per-socket rate limiting is applied
- Verify CORS is locked to production origin

### Definition of Done
- [ ] Auth middleware verified in `server.js` — unauthenticated sockets disconnected on connect
- [ ] All 5+ shape/lock event handlers verify `joinedRooms.has(roomId)` before relaying
- [ ] Per-socket rate limiters confirmed: cursor (20/sec), shape events (10/sec), lock events (10/sec)
- [ ] `origin` is `"https://estimatenepal.com"` in production Socket.io config
- [ ] Load test or manual test confirms cross-org socket cannot receive events from another org's room
- [ ] Findings documented in PROGRESS.md audit log

---

## Phase E-5 — DUDBC Rate Database
**Status:** PLANNED

### Scope
- Admin import of full DUDBC rate schedule (district-wise, fiscal year)
- Public rate browser (searchable, filterable by district and fiscal year)
- Rate publish workflow (draft → review → publish)
- Platform-wide rate updates cascade to all projects using those rates

### Definition of Done
- [ ] Admin can import DUDBC rates from Excel template
- [ ] Rate browser available to all authenticated users
- [ ] Rates filterable by district, fiscal year, category
- [ ] Published rates propagate to BOQ on next compute (cache invalidated)
- [ ] `sanitizeCell()` on all rate export cells
- [ ] `withTenantGuard` / superadmin guard on all admin rate routes
- [ ] `tsc --noEmit` → 0 errors

---

## Phase E-6 — Payments (eSewa / Khalti)
**Status:** PLANNED

### Scope
- eSewa and Khalti payment gateway integration
- Replace manual `PendingPayment` flow with automated payment confirmation
- Webhook handler for payment success/failure
- Auto-activate plan on successful payment

### Definition of Done
- [ ] eSewa payment initiation and callback routes implemented
- [ ] Khalti payment initiation and callback routes implemented
- [ ] Webhook signature verification on both gateways
- [ ] Plan activation triggered automatically on confirmed payment
- [ ] Payment recorded in `PendingPayment` with status transition
- [ ] `AuditLog` entry written on every plan activation
- [ ] `tsc --noEmit` → 0 errors
