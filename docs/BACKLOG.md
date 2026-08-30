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
| BL-010 | 2026-08-22 | Login comparison between Estimation and Bidding not done — best-of-both should be merged. Specifically: Redis rate limiting on auth routes, TOTP/2FA flow, resend-verification button. | I-1 |
| BL-013 | 2026-08-29 | Estimation landing page uses emoji characters as feature icons (clipboard, ruler, chart, etc.) and one emoji in the CTA section. These must be replaced with SVG icons before I-2 ships. | I-2 |
| BL-014 | 2026-08-29 | Registration form has no role selection. UI built in I-1 Session 1 (role cards + API). BLOCKED: SQL column not yet applied (Docker not running). Column must exist in MySQL before this goes live. | I-1 |
| ~~BL-015~~ | ~~2026-08-29~~ | ~~Bidding Platform SSO link in dashboard sidebar opens a new tab rather than integrating inline.~~ | ~~I-5~~ ✅ Resolved — sidebar SSO link replaced with direct `<Link href="/tenders">Tenders</Link>` in I-5. |
| ~~BL-016~~ | ~~2026-08-29~~ | ~~Notification bell only handles canvas events.~~ | ~~I-4~~ ✅ Resolved — dispatchUserNotification stores procurement events into the same Notification model; bell picks them up automatically. |
| ~~BL-017~~ | ~~2026-08-29~~ | ~~When Bidding code is copied into Estimation, all `getServerUser()` calls must be replaced with `getSession()`.~~ | ~~I-5~~ ✅ Resolved — all copied I-5 code uses getSession()/getToken(); no getServerUser() calls present. |
| ~~BL-018~~ | ~~2026-08-29~~ | ~~Post-login redirect is always `/dashboard`.~~ | ~~I-5~~ ✅ Resolved — LoginForm.tsx fetches session after signIn; routes CLIENT/CONTRACTOR to /tenders. |
| ~~BL-024~~ | ~~2026-08-29~~ | ~~Contractor portfolio page not built in I-6.~~ | ~~I-6~~ ✅ Resolved — BidPortfolioProject + BidOrganization declaration models added to Estimation schema; /api/portfolio GET+POST+DELETE + app/portfolio/page.tsx + portfolio-panel.tsx built in I-6 Session 3. |
| ~~BL-025~~ | ~~2026-08-29~~ | ~~Contractor directory shows only name and account_type.~~ | ~~I-6~~ ✅ Resolved — BidOrganization declaration model added; contractors/page.tsx query joins org fields; ContractorsPanel updated to display org name, district, class tag, and verified badge in I-6 Session 3. |
| BL-019 | 2026-08-29 | 2FA / TOTP is not in scope for I-1. Placeholder reserved. When prioritised: add TOTP setup route reachable from settings, 2FA verify step on login when TOTP is enabled, backup codes flow. Bidding has a partial TOTP implementation to draw from. | Future |
| BL-020 | 2026-08-29 | Org auto-verify skipped in `verification-queue/[id]/approve` route. Bidding auto-sets `org.verified = true` when COMPANY_REGISTRATION + PAN both approved, but Estimation's `Org` model has no `verified` field. Needs: `ALTER TABLE Org ADD COLUMN verified BOOLEAN DEFAULT FALSE`, schema update, and re-enable the approval logic. | Future |
| ~~BL-021~~ | ~~2026-08-29~~ | ~~dispatchUserNotification missing in bulk-approve/reject.~~ | ~~I-4~~ ✅ Resolved — lib/notifications.ts created; dispatch wired in bulk-approve, bulk-reject, single approve, single reject, and register. |
| ~~BL-022~~ | ~~2026-08-29~~ | ~~Landing page stats strip not yet live.~~ | ~~I-5~~ ✅ Resolved — /api/public/stats built; stats strip (published tenders, contractors, districts) added to app/page.tsx. |
| ~~BL-023~~ | ~~2026-08-29~~ | ~~Landing page open tenders preview not yet live.~~ | ~~I-5~~ ✅ Resolved — /tenders route built; 3 tender preview cards added to app/page.tsx. |
| ~~BL-026~~ | ~~2026-08-29~~ | ~~Scoring factors admin UI not built.~~ | ~~I-7~~ ✅ Resolved — GET+PATCH /api/admin/scoring-factors (sum=100 validation, Zod, isSuperAdmin guard, $transaction upsert); app/admin/scoring-factors/page.tsx (server, direct Prisma); scoring-factors-panel.tsx (client, live sum display, save guard). Built I-7 S3 2026-08-30. |
| ~~BL-027~~ | ~~2026-08-29~~ | ~~Negotiation thread deferred from I-7.~~ | ~~I-7 S2~~ ✅ Resolved — full negotiation thread built in I-7 Session 2. BidNegotiation + BidNegotiationMessage declaration models. 6 API routes. Client hub + thread view. Contractor thread view. tsc 0 errors. |
| ~~BL-028~~ | ~~2026-08-29~~ | ~~LOA PDF not attached to winner's email.~~ | ~~I-7~~ ✅ Resolved — lib/loa.ts extracted (buildLoaHtml + generateLoaPdf); lib/email.ts EmailAttachment type + attachments param; award/route.ts fire-and-forget IIFE generates PDF buffer and sends via sendEmail with attachments. Built I-7 S3 2026-08-30. |
| ~~BL-029~~ | ~~2026-08-29~~ | ~~Confidential admin view deferred from I-7.~~ | ~~I-7~~ ✅ Resolved — POST /api/admin/tenders/[id]/bids/confidential (passphrase bcrypt.compare, rate-limit, audit log fire-and-forget); app/admin/tenders/[id]/confidential/page.tsx (two-step: passphrase form, bid table grouped by chapter); POST /api/admin/auth/set-passphrase (isSuperAdmin, bcrypt.hash cost 12, secondaryPassphraseHash on User); app/admin/security/page.tsx (set-passphrase form); admin dashboard links added. Audit log deviation fixed I-7 S3 2026-08-30. |

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
