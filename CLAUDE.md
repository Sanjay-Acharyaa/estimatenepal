# EstimateNepal — Takeoff & Estimating Platform

> This app is one half of the EstimateNepal product suite. The other half is the Bidding platform. They are two halves of one product — neither is complete without the other.

## Before doing anything
Read docs/00_MASTER_INDEX.md first. Then read only the files relevant to the current task.

## Rules that never change
1. Unit selection on a Project is the single source of truth for EVERYTHING downstream — canvas inputs, scale presets, quantity display, BOQ, and all exports. Read docs/03_UNITS.md before touching any unit-related code.
2. All quantity math goes through `lib/takeoff.ts` only. Never duplicate computation logic elsewhere.
3. Never run `prisma migrate dev` or `prisma db push`. Read docs/02_DATABASE.md for the correct procedure.
4. Never write to tables that belong to the Bidding platform (prefixed `bid_`).
5. `withTenantGuard(userId, resource.orgId)` must be called on every API route — throws 403 on mismatch.
6. Canvas annotations always write to `DrawingPage.annotationsJson`, never `canvasJson` (legacy field, do not use).
7. BOQ uses a 30-second Redis cache. Call `invalidateBOQCache(projectId)` after any change that affects quantities or rates.
8. Read docs/10_SECURITY.md before building any feature that stores user data, files, or handles uploads.
9. Before building anything (email, storage, auth, analytics) — check if Bidding already has it. Reuse or extend first.
10. Always show a plan and wait for approval before writing code.

## Strict audit rule — enforced at every session end
A phase is COMPLETE only when ALL of the following are true:
- Every DoD bullet re-read from docs/14_BUILD_ROADMAP.md (NOT from docs/PROGRESS.md) and individually verified against the actual file on disk
- `tsc --noEmit` → 0 errors confirmed
- Any deviation from spec was surfaced to the user and approved before building
- If any bullet is not met → phase stays PARTIAL, not marked COMPLETE

## When a defect or improvement is discovered during a phase
Add an entry to docs/BACKLOG.md immediately. Do not let it derail the current phase.

## Tech stack
- Next.js 14 (TypeScript), Tailwind CSS, Prisma v5, MySQL 8
- Konva.js + react-konva for canvas drawing and takeoff
- Socket.io + Redis adapter for real-time multi-user collaboration
- Cloudflare R2 for PDF and file storage (S3-compatible)
- Resend for transactional email
- ExcelJS for Excel exports, Puppeteer for PDF exports
- Tesseract.js for OCR (scale detection)
- Runs on port 3000 via `node server.js` (custom server — required for Socket.io)

## Integration with the Bidding platform
- Estimation is the auth authority. Users register and log in on Estimation. Bidding is accessed via a button after login — no second login required.
- Both platforms share: MySQL database server, Resend account, Cloudflare R2, JWT secret, cookie domain.
- Local dev: both connect to the same Docker MySQL container (`nepali-estimate-mysql-1`).
- Production: Estimation is deployed to DigitalOcean. When Bidding deploys, it joins the same DigitalOcean MySQL database. Bidding tables use the `bid_` prefix; Estimation tables have no prefix.
- The natural workflow: Estimation produces BOQ → user creates a Tender in Bidding seeded from that BOQ → contractors bid → award flows back.

## Schema change rule
Never run `prisma migrate dev` or `prisma db push`. Locally, both Estimation and Bidding share the same Docker MySQL container. Running either Prisma command can attempt to drop tables not in this project's schema — including Bidding's `bid_*` tables.

All schema changes must be applied as raw SQL:

**Local dev:**
```bash
docker exec nepali-estimate-mysql-1 mysql -u root -proot nepaliestimate -e "ALTER TABLE ..."
```

**Production (DigitalOcean):**
Apply via direct MySQL connection on the server. Log every change in docs/PROGRESS.md under "Schema Changes Applied".

After applying, update `prisma/schema.prisma` to match the live state so Prisma Client stays accurate.

## Current build phase
See docs/PROGRESS.md for the current phase, session, and what is built so far.
See docs/14_BUILD_ROADMAP.md for the full phase list and definition of done for each phase.

## End of every session — do these automatically, no prompting needed
1. Run the code quality checklist from docs/14_BUILD_ROADMAP.md against everything built this session. List each item and its status.
2. Re-read the current phase Definition of Done from docs/14_BUILD_ROADMAP.md (not from PROGRESS.md). Check each bullet individually against the actual files on disk. Mark which are met and which are not.
3. If any DoD bullet is unmet → mark the phase PARTIAL in docs/PROGRESS.md. Do not mark it COMPLETE.
4. If any defect or improvement was discovered → add an entry to docs/BACKLOG.md immediately.
5. Update docs/PROGRESS.md: current status block, session row in the phase table, audit log row, and any schema changes applied this session.
6. Write the next session prompt in this exact format:

---
Phase: E-X | Session: Y | Feature: name

Scope:
- bullet list of endpoints, UI components, or features to build
- include unit rules, auth rules, request/response shape, schema checks needed

Show plan first. Wait for approval before writing code.
---
