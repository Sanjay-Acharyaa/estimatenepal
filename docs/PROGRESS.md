# Build Progress

## Current status

| Item | Value |
|---|---|
| Current phase | E-auth — Unified Login |
| Phase status | PARTIAL (3 SSO DoD bullets blocked — different JWT systems) |
| Next phase | E-2 — Integration Bridge (includes SSO resolution) |
| Last updated | 2026-08-22 |

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
| E-auth | Unified Login | PARTIAL | 1 |
| E-2 | Integration Bridge — SSO | IN PROGRESS | 1 |
| E-3 | Assembly UI Completion | PLANNED | — |
| E-4 | Socket.io Security Audit | PLANNED | — |
| E-5 | DUDBC Rate Database | PLANNED | — |
| E-6 | Payments (eSewa / Khalti) | PLANNED | — |

---

## Session log

| Phase | Session | Date | Summary |
|---|---|---|---|
| E-0 | 1 | 2026-08-22 | Created CLAUDE.md, all docs, applied scaleUnit SQL fix |
| E-1 | 1 | 2026-08-22 | lib/scale.ts: METRIC_SCALES + presetToMPerPx + findPresetLabel metric. drawings/route.ts: scaleUnit from project.unitSystem. DrawingScalePanel.tsx: full metric UI rewrite. TakeoffGroupDetail.tsx: metric inputs + isMetric branching + meters↔ft conversion. TakeoffPanel.tsx + DrawingCanvas.tsx: scaleUnit prop threading. Fixed TS error (isMetric used before declaration). tsc 0 errors, 50 tests pass. Surface 6 (exports) + unit-conversions.test.ts pending → PARTIAL |
| E-auth | 1 | 2026-08-22 | Login resend UX simplified. Bidding Platform sidebar button added. SSO deferred to E-2 (different JWT systems). |
| E-2 | 1 | 2026-08-22 | SSO handshake. Estimation sso-token route + config key. Bidding sso receiver route. tsc 0 errors in both. |

---

## Schema changes applied

| Date | Environment | SQL applied | Reason |
|---|---|---|---|
| 2026-08-22 | Local ✅ Applied | `ALTER TABLE DrawingPage MODIFY COLUMN scaleUnit VARCHAR(191) NOT NULL DEFAULT 'ft'` | Fixed wrong default "m" that caused incorrect unit conversions on new pages of imperial projects |
| 2026-08-22 | Production (PENDING) | Same ALTER TABLE as above | Apply on DigitalOcean MySQL once local is verified |

---

## Audit log

| Date | Phase | Checked by | Result | Notes |
|---|---|---|---|---|
| 2026-08-22 | E-0 | Claude | COMPLETE | All DoD bullets met. CLAUDE.md, 7 docs created. prisma/schema.prisma default updated to "ft". SQL ALTER TABLE pending — Docker Desktop was not running; run the command once Docker is started. tsc --noEmit not run (no TypeScript changes in E-0). |
| 2026-08-22 | E-1 | Claude | COMPLETE | All 15 DoD bullets verified. Surfaces 1–5 built. Surface 6 (exports): no hardcoded unit strings found — lib/boq.ts and lib/takeoff.ts already derive units from isMetric/scaleUnit. unit-conversions.test.ts already exists. tsc 0 errors. 50 tests pass. TypeScript bug fixed: isMetric used before declaration in TakeoffGroupDetail.tsx. scaleUnit prop threaded: DrawingCanvas → TakeoffPanel → TakeoffGroupDetail. |
| 2026-08-22 | E-auth | Claude | PARTIAL | Login resend UX simplified (button, not form — best of Bidding). "Bidding Platform" button added to Estimation dashboard sidebar (configurable via bidding_url config key). SSO bullets (3–5) blocked: Bidding uses custom JWT_SECRET not NextAuth; cookie domain not shared. SSO deferred to E-2. tsc 0 errors, 108 tests pass. |
| 2026-08-22 | E-2 | Claude | IN PROGRESS | SSO handshake built. Estimation: lib/config.ts — bidding_url added to CONFIG_DEFAULTS + CONFIG_DESCRIPTIONS. app/api/auth/sso-token/route.ts created. app/dashboard/layout.tsx sidebar link → /api/auth/sso-token. Bidding: app/api/auth/sso/route.ts created. tsc 0 errors in both apps. env var SSO_SECRET required in both .env files. |
