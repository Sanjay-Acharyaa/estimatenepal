# Build Progress

## Current status

| Item | Value |
|---|---|
| Current phase | E-5 — DUDBC Rate Database |
| Phase status | COMPLETE |
| Next phase | E-6 — Payments (eSewa / Khalti) |
| Last updated | 2026-08-29 |

---

## Platform status

| Original Phase | Name | Status |
|---|---|---|
| 1 | Foundation, Auth & Security | ✅ Live |
| 2 | Projects & Bid Board | ✅ Live |
| 3 | PDF Upload, Viewer & Scale | ✅ Live |
| 4a | Canvas Core + Real-Time | ✅ Live |
| 4b | All Takeoff Tools | ✅ Live |
| 4c | Markup & Annotations | ✅ Live |
| 5 | BOQ, Overrides & Exports | ✅ Live |
| 6 | Custom Rates, Rate Analysis & Invites | ✅ Live |

**Additional features built beyond original spec (all live):**
- Government / DUDBC BOQ Export (bilingual Excel)
- BOQ custom columns + column reordering
- Trial & subscription system with coupon codes
- Manual payment flow (PendingPayment)
- Email lifecycle sequence (Day 7, Day 12, expiry, churn, NPS)
- UTM / referral source tracking
- Admin analytics dashboard
- Inline drawing comments (pinned at canvas coordinates)
- Project notes, tasks, change orders, retention tracking
- Subcontractor quote comparison
- Drawing folders (Architectural, Structural, Civil, MEP, General)
- Sentry error monitoring
- UptimeRobot health monitoring
- GitHub Actions cron for trial emails
- Testimonials system
- Dynamic SiteConfig table
- User session tracking
- Assembly library (models built, UI partial — tracked in BACKLOG)

---

## New phase table

| Phase | Name | Status | Sessions |
|---|---|---|---|
| E-0 | Documentation and Foundation | ✅ COMPLETE | 1 |
| E-1 | Dual Unit Support (Meters + Feet) | ✅ COMPLETE | 1 |
| E-auth | Unified Login | ✅ COMPLETE | 1 |
| E-2 | Integration Bridge — SSO handshake ✅; BOQ-to-Tender wizard ✅ | ✅ COMPLETE | 2 |
| E-3 | Assembly UI Completion | ✅ COMPLETE | 1 |
| E-4 | Socket.io Security Audit | ✅ COMPLETE | 1 |
| E-5 | DUDBC Rate Database | ✅ COMPLETE | 1 |
| E-6 | Payments (eSewa / Khalti) | DEFERRED — requires company registration | — |
| I-1 | Login, Registration, Auth Hardening | ✅ COMPLETE | 4 |
| I-2 | Landing Page Unification | ✅ COMPLETE | 1 |
| I-3 | Dashboard Merge | ✅ COMPLETE | 1 |
| I-4 | Email and Notification System Merge | PLANNED | — |
| I-5 | Tender Module (copied from Bidding) | PLANNED | — |
| I-6 | Contractor and Bid Module (copied from Bidding) | PLANNED | — |
| I-7 | Bid Evaluation, Scoring, and Award (copied from Bidding) | PLANNED | — |
| I-8 | Contract, Snag List, and Completion (copied from Bidding) | PLANNED | — |
| I-9 | Real-time Notifications and Webhooks (copied from Bidding) | PLANNED | — |
| I-10 | Admin Panel Unification | PLANNED | — |

**Pricing decision (2026-08-29):** Procurement features (tenders, bids, contracts) are included in existing subscription tiers. No separate pricing. Free plan gets read access to the public tender directory only.

---

## Session log

| Phase | Session | Date | Summary |
|---|---|---|---|
| E-0 | 1 | 2026-08-22 | Created CLAUDE.md, all docs, applied scaleUnit SQL fix |
| E-1 | 1 | 2026-08-22 | lib/scale.ts: METRIC_SCALES + presetToMPerPx + findPresetLabel metric. drawings/route.ts: scaleUnit from project.unitSystem. DrawingScalePanel.tsx: full metric UI rewrite. TakeoffGroupDetail.tsx: metric inputs + isMetric branching + meters↔ft conversion. TakeoffPanel.tsx + DrawingCanvas.tsx: scaleUnit prop threading. Fixed TS error (isMetric used before declaration). tsc 0 errors, 50 tests pass. Surface 6 (exports) + unit-conversions.test.ts pending → PARTIAL |
| E-auth | 1 | 2026-08-22 | Login resend UX simplified. Bidding Platform sidebar button added. SSO deferred to E-2 (different JWT systems). |
| E-2 | 1 | 2026-08-22 | SSO handshake. Estimation sso-token route + config key. Bidding sso receiver route. tsc 0 errors in both. |
| E-2 | 2 | 2026-08-29 | BOQ-to-Tender wizard. Estimation: internal /api/internal/projects/[id]/boq-snapshot (INTERNAL_API_SECRET + X-User-Email tenant guard); sso-token extended with return_to in JWT. Bidding: bid_tenders.estimation_project_id VARCHAR(191) NULL column; Prisma schema updated; proxy /api/estimation/projects/[id]/boq-snapshot; POST /api/tenders extended (estimation_project_id + boq_chapters atomically); new-tender form Suspense wrapper + useSearchParams + BOQ pre-fill banner; client tender detail "View Source Estimation" link; .env.example updated both apps. tsc 0 errors both apps. All 6 E-2 DoD bullets met. |
| I-1 | 1 | 2026-08-29 | procurementRoles column added to schema.prisma. register API updated with Zod validation. RegisterForm.tsx: role selection cards UI (Post tenders / Bid on projects), toggleRole, buildProcurementRolesValue, submit body updated. prisma generate run. tsc 0 errors. SQL ALTER TABLE pending (Docker not running). |
| I-1 | 2 | 2026-08-29 | SQL applied: ALTER TABLE User ADD COLUMN procurementRoles VARCHAR(100) NULL DEFAULT NULL — column confirmed in DB. LoginForm.tsx: added router.refresh() after login success. BL-018 added (role-based post-login redirect deferred to I-5). BL-010 resolved (Estimation login already superior; router.refresh() was the only missing item). tsc 0 errors. Remaining DoD: rate-limit bullet (deviation surfaced), role editing from settings, TOTP, contractor doc upload. |
| I-1 | 3 | 2026-08-29 | Procurement role editing in settings. API: GET + PUT /api/auth/profile extended — procurementRoles in select and profileSchema. Settings page: parseProcurementRoles, toggleProcurementRole, buildProcurementRolesValue, role toggle cards in profile tab, 2FA placeholder row. procurementRoles saved on existing Save Profile button. tsc 0 errors. Remaining DoD: contractor doc upload (Session 4). |
| I-3 | 1 | 2026-08-29 | Dashboard: +2 DB queries (procurementRoles + verifDocs) added to Promise.all; isContractor/isClient/verifApproved/verifPending/verifRejected derived; procurement widget added (contractor verification status + tender teaser, client post-a-tender teaser); 2 conditional quick action links added. Bid stats/analytics deferred to I-5 (no bid models yet). tsc 0 errors. |
| I-2 | 1 | 2026-08-29 | Landing page: 6 emoji icons to SVG, rocket removed from CTA, lock emoji to SVG in pricing badges, 3 procurement sections added (role cards, how it works, security note). tsc 0 errors. |
| I-1 | 4 | 2026-08-29 | Contractor doc upload feature (all copied from Bidding). lib/upload.ts: verificationDocKey added. prisma/schema.prisma: BidVerificationDocument model added (camelCase, @@map bid_verification_documents). SQL: bid_verification_documents created with userId VARCHAR(191). Routes: /api/profile/verification-documents GET+POST, /api/admin/verification-queue GET, /[id]/approve, /[id]/reject, /bulk-approve, /bulk-reject. Admin UI: app/admin/verification-queue/page.tsx + verification-queue-panel.tsx. Settings page: Verification tab (state, loadVerifDocs, uploadVerifDoc, tab button, full panel JSX). BL-020 (org auto-verify), BL-021 (notification dispatch) added. tsc 0 errors. |
| E-3 | 1 | 2026-08-29 | Assembly UI Completion. All backend API routes and the library browser UI already existed. Added: ApplyModal component (project picker + discipline picker → POST /api/assemblies/[id]/apply) in app/dashboard/assemblies/page.tsx; "Apply to Project" button in preview panel footer wired to ApplyModal; components/assemblies/SaveAsAssemblyButton.tsx (new client component — group multi-select modal → POST /api/projects/[id]/assemblies/save); "Save as Assembly" button added to project detail page actions bar (OWNER/ADMIN only). tsc 0 errors. All 6 DoD bullets met. No schema changes. |
| E-5 | 1 | 2026-08-29 | DUDBC Rate Database. Research showed admin import, publish workflow, sanitizeCell(), superadmin guard, and admin UI all pre-existing. Built: GET /api/rates/fiscal-years (new endpoint, Redis-cached, invalidated by invalidateDudbcCaches()); updated lib/rates.ts — invalidateDudbcCaches() now also deletes "dudbc:fiscal-years" key; extended GET /api/rates — fiscalYear (regex-validated) + district (whitelisted against NEPAL_DISTRICTS) query params, district merges DistrictRate override into baseRate, cache key includes both dimensions; RateCatalog.tsx — fiscalYear + district state + dropdown UI wired into loadRates. Cascade verified: DUDBC rates have orgId=null and are visible to all orgs on publish + cache invalidation — no extra code needed. tsc 0 errors. No schema changes. |
| E-4 | 1 | 2026-08-29 | Socket.io Security Audit. 3 defects found and fixed in server.js. (1) CRITICAL: auth middleware called next() unconditionally — unauthenticated sockets proceeded; removed client-supplied handshake.auth.userId fallback; now calls next(new Error("Unauthorized")) when socket.data.orgId is absent. (2) CRITICAL (cascaded): join:room tenant guard was wrapped in if(socket.data.orgId) — unauthenticated sockets bypassed it entirely; fixed by Fix 1 (all sockets now have orgId before reaching join:room). (3) HIGH: cursor:move lacked joinedRooms.has(roomId) guard — added. (4) MEDIUM (bonus): shape:heartbeat had no rate limit — added allow("shape:hb", 5). CORS confirmed: origin "https://estimatenepal.com" hardcoded. All DoD bullets verified. tsc 0 errors. No schema changes. |

---

## Schema changes applied

| Date | Environment | SQL applied | Reason |
|---|---|---|---|
| 2026-08-22 | Local ✅ Applied | `ALTER TABLE DrawingPage MODIFY COLUMN scaleUnit VARCHAR(191) NOT NULL DEFAULT 'ft'` | Fixed wrong default "m" that caused incorrect unit conversions on new pages of imperial projects |
| 2026-08-22 | Production (PENDING) | Same ALTER TABLE as above | Apply on DigitalOcean MySQL once local is verified |
| 2026-08-29 | Local ✅ Applied | `ALTER TABLE User ADD COLUMN procurementRoles VARCHAR(100) NULL DEFAULT NULL` | I-1: store CLIENT/CONTRACTOR role at registration. Column confirmed present in DB. |
| 2026-08-29 | Local ✅ Applied | `CREATE TABLE bid_verification_documents (...)` with userId VARCHAR(191) — see Session 4 log for full DDL | I-1: contractor document upload feature. Dropped and recreated after initial error (INT vs VARCHAR(191) for userId). |

---

## Audit log

| Date | Phase | Checked by | Result | Notes |
|---|---|---|---|---|
| 2026-08-22 | E-0 | Claude | COMPLETE | All DoD bullets met. CLAUDE.md, 7 docs created. prisma/schema.prisma default updated to "ft". SQL ALTER TABLE pending — Docker Desktop was not running; run the command once Docker is started. tsc --noEmit not run (no TypeScript changes in E-0). |
| 2026-08-22 | E-1 | Claude | COMPLETE | All 15 DoD bullets verified. Surfaces 1–5 built. Surface 6 (exports): no hardcoded unit strings found — lib/boq.ts and lib/takeoff.ts already derive units from isMetric/scaleUnit. unit-conversions.test.ts already exists. tsc 0 errors. 50 tests pass. TypeScript bug fixed: isMetric used before declaration in TakeoffGroupDetail.tsx. scaleUnit prop threaded: DrawingCanvas → TakeoffPanel → TakeoffGroupDetail. |
| 2026-08-22 | E-auth | Claude | PARTIAL → COMPLETE (2026-08-29) | Login resend UX simplified (button, not form — best of Bidding). "Bidding Platform" button added to Estimation dashboard sidebar (configurable via bidding_url config key). SSO bullets (3–5) blocked at time of session: Bidding uses custom JWT_SECRET not NextAuth; cookie domain not shared. SSO deferred to E-2. tsc 0 errors, 108 tests pass. Closed COMPLETE 2026-08-29: all 5 DoD bullets verified — bullet 3 (no second login) confirmed via E-2 SSO token exchange; bullets 4–5 deviation approved (token exchange instead of shared cookie/NEXTAUTH_SECRET — intent fully met). |
| 2026-08-22 | E-2 | Claude | IN PROGRESS | SSO handshake built. Estimation: lib/config.ts — bidding_url added to CONFIG_DEFAULTS + CONFIG_DESCRIPTIONS. app/api/auth/sso-token/route.ts created. app/dashboard/layout.tsx sidebar link → /api/auth/sso-token. Bidding: app/api/auth/sso/route.ts created. tsc 0 errors in both apps. env var SSO_SECRET required in both .env files. |
| 2026-08-29 | I-1 | Claude | COMPLETE | Sessions 1-4 complete. All DoD bullets verified: role selection at registration, role editing in settings, router.refresh() on login, auth routes protected by checkApiRateLimit (already met — deviation approved), contractor doc upload full feature (API routes + admin queue + settings Verification tab). tsc 0 errors. BL-019 (2FA), BL-020 (org auto-verify), BL-021 (notification dispatch) noted and backlogged. |
| 2026-08-29 | I-3 | Claude | COMPLETE | app/dashboard/page.tsx: +2 queries (procurementRoles, verifDocs) in Promise.all; procurement widget (contractor verification status + tender teaser; client post-a-tender teaser) added between secondary row and Recent Projects; 2 conditional quick action links added. Bid/tender analytics deferred to I-5. tsc 0 errors. |
| 2026-08-29 | I-2 | Claude | COMPLETE | app/page.tsx: 6 emoji feature icons replaced with inline SVGs (clipboard, ruler, bar chart, file, users, grid); rocket emoji removed from CTA; lock emoji in both pricing badges replaced with SVG lock; 3 procurement sections added (role cards for clients/contractors, how procurement works 4-step, confidential by design security note). All prices/limits confirmed dynamic from getAllConfigs(). BL-022, BL-023 added (stats strip + tender preview deferred to I-5). tsc 0 errors. |
| 2026-08-29 | E-3 | Claude | COMPLETE | All 6 DoD bullets verified. Assembly library browser, group preview, category/source filter, duplicate, and edit already existed. Session built: ApplyModal (project + discipline picker, POST apply); "Apply to Project" button in preview footer; SaveAsAssemblyButton client component (group multi-select, POST save); button on project detail page (OWNER/ADMIN). tsc 0 errors. No schema changes. |
| 2026-08-29 | E-5 | Claude | COMPLETE | All 6 DoD bullets met. Admin import/publish/guard/sanitizeCell pre-existing. New: GET /api/rates/fiscal-years (cached, auth-gated, invalidated on publish); GET /api/rates extended with fiscalYear (regex) + district (NEPAL_DISTRICTS whitelist) filter params, district merges DistrictRate override, cache key updated; RateCatalog.tsx: fiscal year + district dropdowns wired into loadRates; invalidateDudbcCaches() now also clears dudbc:fiscal-years key. Cascade automatic (orgId=null). tsc 0 errors. No schema changes. |
| 2026-08-29 | E-4 | Claude | COMPLETE | Full audit of server.js against docs/10_SECURITY.md §8. Findings: (1) CRITICAL — auth middleware never disconnected unauthenticated sockets; next() called unconditionally; client-supplied handshake.auth.userId fallback set userId without orgId creating partial-auth bypass path. Fixed: removed fallback; disconnect via next(new Error) when socket.data.orgId absent after JWT decode. (2) CRITICAL (cascaded) — join:room tenant guard wrapped in if(socket.data.orgId) so unauthenticated sockets bypassed org check and could join any room and receive all room events. Fixed by (1) — all connected sockets now guaranteed to have orgId. (3) HIGH — cursor:move relayed to any roomId without joinedRooms guard; attacker could relay cursor events to a room without passing the tenant check. Fixed: added if(!joinedRooms.has(roomId)) return. (4) MEDIUM (beyond DoD) — shape:heartbeat had no rate limit; could flood Redis with expire() calls. Fixed: added allow("shape:hb", 5). CORS confirmed: origin "https://estimatenepal.com" — PASS. Rate limits confirmed: cursor 20/sec, shape 10/sec + allowUserShape cross-connection limiter, lock 10/sec — all PASS. tsc 0 errors. No schema changes. |
