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

---

## Integration Phases — Bidding into Estimation

Bidding platform features are merged into Estimation in the phases below. Before starting any I-phase, re-read this section header.

**Pricing decision (locked 2026-08-29):** All procurement features are included in existing Estimation subscription tiers. No separate per-tender pricing. Free plan users get read access to the public tender directory. Posting tenders and submitting bids requires a paid plan.

**Merge rule for common screens (login, dashboard, emails):** Read both Estimation and Bidding versions of the screen. Identify what Bidding has that Estimation does not. Add only those specific elements to Estimation's existing files. Do not rewrite the Estimation file from scratch.

**Copy rule for Bidding-only features (tenders, bids, contracts, scoring, notifications):** Copy the file or directory from Bidding into Estimation's equivalent path. Then make only the changes needed: update import paths, replace `getServerUser()` calls with `getSession()` from `@/lib/auth`, replace any hardcoded URL or config value with a call to `getConfig()` from `@/lib/config`. Do not rewrite logic that is already tested.

**Protected files — must not be modified during any I-phase:**
- `lib/takeoff.ts` — all quantity math lives here, never duplicated
- `lib/boq.ts` — BOQ computation
- `lib/scale.ts` — scale math and presets
- All canvas and Konva components: `TakeoffGroupDetail`, `TakeoffPanel`, `DrawingCanvas`, `DrawingScalePanel`
- All export routes: BOQ Excel, PDF, rate analysis, government bilingual export
- `server.js` — custom server for canvas Socket.io collaboration
- Analytics integrations: Google Analytics, Meta Pixel, Sentry, UptimeRobot
- Stripe / eSewa / Khalti payment code once E-6 is built

If a change touches a protected file for any reason, stop and get explicit approval before proceeding.

**No emojis rule (applies to all I-phases):** No emoji characters in any UI text, button labels, notification messages, generated documents, or email content. Replace existing emoji icons in Estimation's landing page feature grid with SVG icons during I-2.

---

## Phase I-1 — Login, Registration, and Auth Hardening
**Status:** PARTIAL
**Depends on:** E-auth, E-2

### Scope
Complete the E-auth phase items that were deferred, and add the remaining auth features from Bidding that Estimation does not have. This is additive work on existing Estimation auth files.

- Auth routes protected by Estimation's existing `checkApiRateLimit` from `lib/security.ts` (rate-limiter-flexible with Redis + memory fallback — superior to Bidding's Lua script; no copy needed)
- Add role selection to Estimation's register form: the user selects their purpose at signup (Client posting tenders, Contractor bidding). Estimator-only is the default when neither is selected. One account can hold all roles. Role is stored and addable later from settings.
- Port the contractor document verification upload (verification documents, admin queue, approval flow) from Bidding
- Verify the E-auth SSO DoD bullets are met: JWT secret shared, cookie domain shared, clicking the Bidding Platform button opens Bidding without a second login prompt
- 2FA / TOTP: placeholder reserved — not in scope for I-1 (see BL-019)

### Definition of Done
- [x] Auth routes protected by `checkApiRateLimit` from `lib/security.ts` — register route confirmed; login uses NextAuth which rate-limits at the provider level
- [x] Register form shows role selection (Client / Contractor) — Estimator-only is the null default — stored on the user record; `procurementRoles` column applied in DB
- [ ] Role can be changed or added from dashboard settings after registration
- [ ] Contractor document upload route exists; uploaded docs appear in admin verification queue
- [x] E-auth SSO DoD bullets 3, 4, 5 confirmed: built in E-2 (SSO token route, Bidding receiver, shared JWT secret)
- [x] `withTenantGuard` on all new routes — register is public (no tenant at registration); no other new routes this phase
- [x] `tsc --noEmit` → 0 errors

---

## Phase I-2 — Landing Page Unification
**Status:** PLANNED
**Depends on:** I-1

### Scope
Update Estimation's landing page to reflect the unified platform (estimation + procurement), using Estimation's existing design as the base. No design overhaul. Additive changes only.

- Replace emoji icons in the FEATURES grid with SVG icons (Estimation's landing page currently uses emoji characters as feature icons — this violates the no-emojis rule)
- Add a roles section below the features grid: three cards explaining the platform for Clients (posting tenders), Contractors (bidding), and Consultants (BOQ preparation). Modelled on Bidding's role cards but styled to match Estimation's design system.
- Add a live stats strip (active tenders, registered contractors, districts covered) — pulls from the public stats API endpoint being ported in I-5. Renders zeros gracefully if the endpoint is unavailable.
- Add a "Browse Open Tenders" link to the nav bar alongside Pricing and Sign In
- Add a "Confidential by design" trust section above the footer, describing bid isolation, audit trail, and OTP signing — drawn from Bidding's security section copy
- Add the "Browse Open Tenders" CTA to the hero as a third button option
- Remove the `🚀` emoji from the CTA section
- All new copy: no emoji, no em dashes

### Definition of Done
- [ ] No emoji characters remain in landing page UI (icons replaced with inline SVG)
- [ ] Roles section exists with three cards (Client, Contractor, Consultant) with correct value prop copy
- [ ] Stats strip renders from API; renders zeros when API is unavailable (graceful degradation)
- [ ] "Browse Open Tenders" in nav links to `/tenders` (the tender listing route added in I-5 — nav link is present even before I-5 is built; it will resolve once I-5 is deployed)
- [ ] Security trust section exists above footer
- [ ] No em dashes in any landing page copy
- [ ] Sticky nav, pricing section, testimonials, footer, and all existing sections unchanged
- [ ] SEO JSON-LD schema blocks updated to mention procurement features alongside estimating
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-3 — Dashboard Merge
**Status:** PLANNED
**Depends on:** I-1

### Scope
Add procurement-related panels to Estimation's dashboard. Estimation's existing dashboard (project stats, recent projects, due dates, activity log) is unchanged. New panels are added below and are only visible based on the user's role.

- Add a "Procurement" panel to the dashboard: shows tender summary for CLIENT role (tenders posted, active, closed), bid summary for CONTRACTOR role (bids submitted, shortlisted, awarded)
- Extend the bid-board page (`/dashboard/bid-board`) to show live tender status for tenders created from Estimation projects (requires I-5 to be deployed for live data; page renders gracefully before I-5)
- Merge the calendar: Estimation's bid-due-date calendar gains tender deadlines and site visit dates from the procurement module
- Add "New Tender" shortcut to the dashboard quick-actions area for CLIENT role users
- Add "Browse Open Tenders" shortcut for CONTRACTOR role users
- Sidebar: the "Bidding Platform" SSO link added in E-auth remains but is relabelled "Procurement" once the features are fully integrated in I-5 through I-9

### Definition of Done
- [ ] Dashboard shows a Procurement section when the user has CLIENT or CONTRACTOR role; hidden for Estimator-only users
- [ ] CLIENT procurement panel shows: tenders posted count, tenders currently accepting bids count, link to tender list
- [ ] CONTRACTOR procurement panel shows: bids submitted count, shortlisted count, awarded count, link to bid list
- [ ] Bid-board page has a "Live Tenders" tab alongside existing project tracking; tab renders gracefully with no data before I-5
- [ ] Calendar displays project bid-due dates and tender deadlines in one view
- [ ] No changes to existing dashboard project stats, recent projects list, activity log, or due-soon list
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-4 — Email and Notification System Merge
**Status:** PLANNED
**Depends on:** I-1

### Scope
Estimation has a lifecycle email system (Day 7, Day 12, expiry, churn, NPS) running via GitHub Actions cron and Resend. Bidding has a DB-driven notification template system covering procurement events (bid received, deadline extended, award, contract signed, etc.). Both must coexist without conflict. The lifecycle emails are not touched. The procurement notification templates are added as a new table and dispatch system.

- Copy Bidding's notification template DB structure and seed data into Estimation (table: `bid_notification_templates` already prefixed — no rename needed if keeping the bid_ prefix; or rename to `notification_templates` and update all references)
- Copy Bidding's `lib/notifications.ts` (or equivalent dispatch function) into Estimation — update imports to use Estimation's Resend instance and `getSession` auth
- Copy Bidding's `dispatchUserNotification` and `dispatchOrgNotification` functions
- Port notification preferences UI (per-channel: in-app, email) — copy from Bidding's `app/notifications/preferences/`
- Port the notification bell and notification list panel — Bidding has `app/notifications/` with a full panel; Estimation already has a `NotificationBell` component — compare both and merge, keeping Estimation's existing bell component as the base
- Estimation's lifecycle cron emails (Day 7, Day 12, expiry, churn, NPS) are not modified

### Definition of Done
- [ ] Notification template table exists in the DB (raw SQL applied, logged in PROGRESS.md)
- [ ] At least these templates seeded: `bid_received`, `bid_deadline_extended`, `tender_awarded`, `contract_signed`, `snag_raised`
- [ ] `dispatchUserNotification(userId, eventType, vars)` function exists in Estimation codebase
- [ ] Notification bell in dashboard nav shows unread count from the procurement notification table
- [ ] Notification list page shows procurement notifications
- [ ] User can set email and in-app preferences per notification type
- [ ] Lifecycle cron emails (Day 7, Day 12, expiry, churn, NPS) are not changed and still function
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-5 — Tender Module (copied from Bidding)
**Status:** PLANNED
**Depends on:** I-1, I-4

### Scope
Copy the entire tender module from Bidding into Estimation. This includes the public tender directory, tender detail page, tender creation (standalone and via BOQ bridge), and client tender management. The BOQ-to-Tender bridge is the highest-value deliverable in this phase.

Files to copy from Bidding (adjust imports and auth calls after copying):
- `app/api/tenders/` — all tender CRUD routes
- `app/api/public/stats/` — live stats endpoint
- `app/api/tenders/search/` — public tender search
- `app/tenders/` — public tender listing and detail pages
- `app/client/tenders/` — client tender management UI
- `lib/tender-utils.ts` or equivalent shared tender logic (if exists)

After copying, for each file:
- Replace `getServerUser()` with `getSession()` from `@/lib/auth`
- Replace any hardcoded URL constants with `getConfig()` calls
- Verify `withTenantGuard` is called on every route that touches tenant data
- Replace any hardcoded text strings with config-driven or i18n-ready constants

BOQ-to-Tender bridge (the key integration point):
- Add a "Post as Tender" button to the Estimation project detail page — visible only to users with CLIENT role who own the project
- Clicking opens a wizard pre-populated with: project name as tender title, district from project, BOQ groups mapped to `bid_boq_items`, drawings linked (no re-upload)
- On submit: creates a `bid_tender` row, copies BOQ items to `bid_boq_items`, links project drawings as tender drawings
- A `estimationProjectId` column on `bid_tender` (nullable, references `Project.id`) tracks the link
- "View Estimation Project" link on tender detail when `estimationProjectId` is set

### Definition of Done
- [ ] `app/tenders/` exists — public listing with district filter, status filter, deadline urgency chips (turns red at 3 days or fewer)
- [ ] `app/tenders/[id]/` exists — full tender detail page visible to unauthenticated users for PUBLIC tenders
- [ ] `app/client/tenders/` exists — client sees their own tenders, can create new, manage existing
- [ ] `app/api/public/stats` returns `{ published_tenders, registered_contractors, districts_covered }` — used by landing page stats strip (I-2)
- [ ] `app/api/tenders/search` returns paginated tender list with filters
- [ ] "Post as Tender" button on Estimation project detail page (CLIENT role only)
- [ ] BOQ-to-Tender wizard pre-populates from project without re-entry — all BOQ line items appear on the tender's BOQ
- [ ] `bid_tender.estimationProjectId` column exists (raw SQL applied, logged in PROGRESS.md)
- [ ] "View Estimation Project" link on tender detail when project link exists
- [ ] Deadline urgency chip component is a reusable component, not inline per page
- [ ] All tender routes call `withTenantGuard` — a user can only manage their own org's tenders
- [ ] No bidder can create or edit a tender (role guard enforced at API level)
- [ ] No hardcoded text in copied files — all config values through `getConfig()`
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-6 — Contractor and Bid Module (copied from Bidding)
**Status:** PLANNED
**Depends on:** I-5

### Scope
Copy the contractor directory, bid submission, invitation system, and Q&A from Bidding. Bid isolation is the critical security requirement: no contractor can read another contractor's rates, quantities, or totals under any code path.

Files to copy from Bidding:
- `app/contractors/` — public contractor directory
- `app/api/contractors/` — contractor profile and portfolio routes
- `app/portfolio/` — contractor portfolio management
- `app/tenders/[id]/bids/[bidId]/` — bid form
- `app/api/tenders/[id]/bids/` — bid CRUD routes
- `app/tenders/[id]/invitations/` — invitation accept/decline UI
- `app/api/tenders/[id]/invitations/` — invitation routes
- `app/tenders/[id]/qanda/` — Q&A UI for contractors
- `app/client/tenders/[id]/qanda/` — Q&A UI for clients
- `app/api/tenders/[id]/qanda/` — Q&A routes

After copying, apply the same import and auth adjustments as I-5.

### Definition of Done
- [ ] `app/contractors/` exists — searchable directory of verified contractors with profile cards
- [ ] Contractor portfolio page exists and is editable by the contractor
- [ ] Bid form exists — contractor fills in rate per BOQ item; own rates are shown but no other contractor's rates are visible anywhere
- [ ] Bid isolation verified: logged in as Contractor A with a submitted bid, then logged in as Contractor B — Contractor B's bid form and API responses contain no data from Contractor A's bid. Verified both at API level (direct route call) and UI level.
- [ ] Invitation system: client can invite contractors by email or by searching the contractor directory
- [ ] Invited contractor receives email notification and sees invitation in their dashboard
- [ ] Contractor can accept or decline invitation
- [ ] Q&A thread exists on tender detail — contractors post questions, client answers, answers visible to all
- [ ] Q&A moderation: client can mark a question as answered; unanswered questions visible to client
- [ ] `withTenantGuard` on all routes; bid data additionally guarded by `bidder_user_id` check
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-7 — Bid Evaluation, Scoring, and Award (copied from Bidding)
**Status:** PLANNED
**Depends on:** I-6

### Scope
Copy the scoring engine, bid comparison matrix, shortlisting, negotiation thread, and Letter of Award generation from Bidding. Scoring weights must be configurable from the admin panel — nothing hardcoded.

Files to copy from Bidding:
- `app/client/tenders/[id]/score/` — scoring UI
- `app/client/tenders/[id]/bids/[bidId]/` — client bid detail view
- `app/client/tenders/[id]/negotiate/` — negotiation thread UI
- `app/client/tenders/[id]/award/` — award panel
- `app/api/tenders/[id]/score/` — scoring engine route
- `app/api/tenders/[id]/bids/[bidId]/` — bid detail and status routes
- `app/api/tenders/[id]/negotiate/` — negotiation routes
- `app/api/tenders/[id]/award/` — award route
- `app/tenders/[id]/loa/` — Letter of Award download for contractor
- `app/superadmin/scoring-factors/` — scoring factor config (adapted to Estimation's admin panel path)
- `app/superadmin/tenders/[id]/confidential/` — confidential view (adapted to Estimation's admin)

### Definition of Done
- [ ] Scoring runs automatically when client closes bids — each bid gets a score (0-100) based on configurable weights
- [ ] Scoring factors are editable from admin panel — weights must sum to 100; invalid weights rejected
- [ ] Bid comparison page shows all bids ranked by score; outlier bids flagged
- [ ] Client can shortlist or reject bids with a written note
- [ ] Negotiation thread: client opens negotiation with shortlisted contractors; contractor can submit a revised bid; multi-round
- [ ] Bid withdrawal flagging: if a contractor withdraws beyond the configured threshold, their account is flagged
- [ ] Award route: sets one bid to AWARDED, all other submitted/shortlisted bids set to NOT_AWARDED in a single transaction
- [ ] Letter of Award generated as PDF and sent to the winning contractor via email
- [ ] Confidential view in admin requires separate passphrase and logs every access in audit log
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-8 — Contract, Snag List, and Completion (copied from Bidding)
**Status:** PLANNED
**Depends on:** I-7

### Scope
Copy the contract drafting, OTP-verified digital signing, snag list, completion certificate, and two-way ratings from Bidding. Generated contract documents are in Nepali language; the BOQ section within the contract stays in English.

Files to copy from Bidding:
- `app/client/tenders/[id]/contract/` — client contract management
- `app/tenders/[id]/contract/` — contractor contract view and signing
- `app/api/tenders/[id]/contract/` — contract routes
- `app/client/tenders/[id]/snags/` — snag list UI for client
- `app/tenders/[id]/completion/` — completion view for contractor
- `app/client/tenders/[id]/completion/` — completion panel for client
- `app/api/tenders/[id]/snags/` — snag list routes
- `app/contractor/[userId]/ratings/` — contractor public ratings page
- `app/api/tenders/[id]/ratings/` — rating submission routes

### Definition of Done
- [ ] Contract wizard lets client draft clauses; contract body is in Nepali; BOQ section stays in English
- [ ] Both client and contractor can sign the contract via OTP verification sent to their registered email
- [ ] Signed contract PDF generated by Puppeteer and stored in Cloudflare R2
- [ ] Snag list: client raises items with description; contractor marks resolved; client closes each item
- [ ] Completion certificate generated and downloadable once all snag items are closed
- [ ] Both parties receive email when contract is signed, when snags are raised, and when completion is certified
- [ ] Two-way ratings: after completion, client rates contractor (1-5) and contractor rates client (1-5); neither can see the other's rating until both have submitted
- [ ] Contractor's ratings are visible on their public profile page and factored into their scoring weight in future bids
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-9 — Real-time Notifications and Webhooks (copied from Bidding)
**Status:** PLANNED
**Depends on:** I-4, I-5

### Scope
Port Bidding's procurement notification dispatch to work through Estimation's existing Socket.io server. Estimation already has Socket.io running in `server.js` for canvas collaboration — procurement notifications use the same server but separate namespaces or rooms. Do not modify the canvas Socket.io logic.

Files to copy from Bidding:
- `lib/socket-server.ts` — review for reuse; Estimation's `server.js` already initialises Socket.io, so only the notification emit logic is needed, not the server setup
- `app/api/org/webhooks/` — webhook management routes
- `app/api/webhooks/dispatch/` — webhook dispatch logic (if separate)
- The notification dispatch and template system is already ported in I-4; this phase wires it to real-time delivery

### Definition of Done
- [ ] Procurement notifications (bid received, deadline extended, award, contract signed, snag raised) are delivered in real-time via Socket.io to connected users without a page refresh
- [ ] Notification bell count updates in real-time when a new notification arrives
- [ ] Canvas Socket.io collaboration is not affected — verify by running a multi-user canvas session alongside a notification delivery
- [ ] Org-level webhooks: org admin can register a webhook URL and secret; procurement events POST to the URL with HMAC-SHA256 signature
- [ ] Webhook secret is encrypted at rest (AES-256-GCM) — copy Bidding's `lib/crypto.ts` encrypt/decrypt functions
- [ ] `tsc --noEmit` → 0 errors

---

## Phase I-10 — Admin Panel Unification
**Status:** PLANNED
**Depends on:** I-5, I-6, I-7, I-8, I-9

### Scope
Merge Estimation's `/admin` panel with Bidding's `/superadmin` panel into a single admin area. Estimation's existing admin features (users, payments, analytics, coupons, emails, rates, testimonials) are kept. Bidding's additional capabilities are added to the same panel.

- Port Bidding's TOTP setup and passphrase requirement for admin login (separate from user-level 2FA in I-1)
- Port Bidding's feature flags system — per-org and platform-wide toggles for unreleased features
- Port scoring factor configuration UI (admin can change scoring weights without code deploy)
- Port contractor verification queue (admin reviews uploaded documents, approves or rejects)
- Port escalations panel (flagged withdrawals, conflict-of-interest reports)
- Port broadcast message system (platform-wide or org-targeted messages)
- Merge analytics: add tender, bid, and geographic breakdown charts to Estimation's existing analytics page
- Port confidential bid view: requires separate passphrase entry; every access logged in audit log
- Port tender oversight: admin can see all tenders and intervene if needed
- Port notification template management UI (admin can edit template copy without code deploy)
- After this phase is complete: update Nginx to remove the `/bid/*` route (the Bidding platform process is retired)

### Definition of Done
- [ ] Admin login requires TOTP once set up; setup UI accessible on first admin login
- [ ] Confidential bid view requires passphrase separate from admin login; every access is an audit log entry
- [ ] Feature flags page exists — admin can toggle flags per org or platform-wide
- [ ] Scoring factor editor exists — weights validated to sum to 100 before save
- [ ] Contractor verification queue exists — admin sees pending document uploads, can approve or reject with a note
- [ ] Escalations panel exists — shows flagged withdrawals, COI reports; admin can resolve or dismiss
- [ ] Broadcast panel exists — admin can send a message to all users or a specific org
- [ ] Analytics page includes tender count by district, bid volume, contractor activity charts
- [ ] Notification template editor exists — admin edits template body, subject, variables without code deploy
- [ ] Tender management page — admin can view all tenders across all orgs, can extend deadlines, can cancel
- [ ] All existing Estimation admin features (payments, coupons, emails, rates, testimonials, activity log) are unchanged
- [ ] `tsc --noEmit` → 0 errors
- [ ] After deployment: Nginx `/bid/*` route removed and Bidding PM2 process retired
