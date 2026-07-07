# NepaliEstimate — Master Product Specification
**Version 4.0 | July 2026 | Confidential**

> MVP is live at [estimatenepal.com](https://estimatenepal.com). Phases 1–6 complete. This document is the single source of truth for all development work.

---

## Quick Reference

| Item | Detail |
|------|--------|
| Product | NepaliEstimate — Construction Takeoff & Estimating Platform |
| Live URL | estimatenepal.com |
| Stack | Next.js 14 · MySQL · Prisma · Konva.js · Socket.io · Redis · Cloudflare R2 |
| Auth | NextAuth.js (Credentials, JWT + httpOnly refresh cookie) |
| Email | Resend — noreply@estimatenepal.com |
| Currency | NRS (Nepali Rupee) |
| Calendar | AD + BS (Bikram Sambat) |
| MVP Phases | 6 of 9 complete |

---

## How to Use This Document with Claude

Paste this document at the start of a new session with:

> You are a senior full-stack developer and security architect. This is the master spec for NepaliEstimate, a construction takeoff and estimating platform for Nepal. Read it fully before responding. We are currently working on **[PHASE X — FEATURE NAME]**. Help me implement **[specific task]**.

**Key conventions:**
- `withTenantGuard(userId, resource.orgId)` must be called on every API route
- All quantity math goes through `lib/takeoff.ts` (not `lib/quantity.ts`)
- Schema changes: update `prisma/schema.prisma` first, run `prisma db push`
- Canvas annotations always write to `DrawingPage.annotationsJson`, never `canvasJson`
- New analytics events: add to `AnalyticsEventName` union in `lib/analytics.ts`
- BOQ cache is 30-second Redis cache — call `invalidateBOQCache(projectId)` after any data change that affects quantities or rates

---

## 1. Product Overview

### What It Solves

| Problem | Current Reality | NepaliEstimate Solution |
|---------|----------------|------------------------|
| No Nepal-calibrated tool | PlanSwift/Procore in USD, no NRS | Built for Nepal, NRS, DUDBC rates |
| Manual quantity calculation | Printed drawing measurements by hand | Digital PDF takeoff, instant quantities |
| No DUDBC rate database | Engineers look up printed rate books | DUDBC rates + district overrides |
| No Measurement Book format | MB prepared manually in Excel | Auto-generated DUDBC MB format |
| No BS calendar | Government docs need BS dates | AD/BS dual calendar in all exports |
| No collaboration | Teams email Excel files | Real-time multi-user takeoff |
| No Government BOQ format | Manual DUDBC BOQ in Word | One-click bilingual DUDBC BOQ export |

### Target Customers
- Construction companies and contractors in Nepal
- DUDBC engineers and government offices
- Engineering consultancies and quantity surveyors
- Individual estimators and freelancers

### Business Model
Multi-tenant SaaS, 14-day free trial, subscription plans priced in NPR. Pricing configurable via `SiteConfig` table (no code deploy required). Current payments are manual (WhatsApp notify → admin activates). eSewa/Khalti integration is Phase 9.

---

## 2. Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation, Auth & Security | ✅ Live |
| 2 | Projects & Bid Board | ✅ Live |
| 3 | PDF Upload, Viewer & Scale | ✅ Live |
| 4a | Canvas Core + Real-Time | ✅ Live |
| 4b | All Takeoff Tools | ✅ Live |
| 4c | Markup & Annotations | ✅ Live |
| 5 | BOQ, Overrides & Exports | ✅ Live |
| 6 | Custom Rates, Rate Analysis & Invites | ✅ Live |
| 7 | Nepali Language (नेपाली) | Planned |
| 8 | DUDBC Rate Database | Planned |
| 9 | Tender Package & Online Payments | Planned |

### Additional Features Built (Beyond Original Spec)
- Government / DUDBC BOQ Export (bilingual Excel, official format)
- BOQ custom columns + column reordering
- Trial & subscription system with coupon codes
- Manual payment flow (PendingPayment table)
- Email lifecycle sequence (Day 7, Day 12, expiry, churn, NPS)
- UTM / referral source tracking on User model
- Admin analytics dashboard (/admin/analytics)
- Inline drawing comments (pinned at canvas coordinates)
- Project notes, tasks, change orders, retention tracking
- Subcontractor quote comparison
- Drawing folders (Architectural, Structural, Civil, MEP, General)
- Sentry error monitoring
- UptimeRobot health monitoring
- GitHub Actions cron for trial emails
- Testimonials system with superadmin approval
- Dynamic SiteConfig table
- User session tracking (UserSession model)
- Assembly library (models built, UI partial)

---

## 3. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 (App Router) | TypeScript |
| UI | Tailwind CSS + Radix UI | Component library hand-built |
| Canvas | Konva.js + react-konva | 5-layer architecture |
| PDF | PDF.js (client) + pdf-lib (server) | |
| Real-Time | Socket.io + Redis adapter | Per-page rooms |
| Database | MySQL 8 | On DigitalOcean server |
| ORM | Prisma v5 | Schema is single source of truth |
| Auth | NextAuth.js | Credentials, JWT + httpOnly refresh |
| Cache | Redis (Upstash) | Sessions, rate limiting, Socket.io |
| Storage | Cloudflare R2 | Pre-signed URLs, no egress cost |
| OCR | Tesseract.js (server-side) | eng+nep |
| Email | Resend | react-email templates |
| Excel Export | ExcelJS | Multi-sheet, formula strings |
| PDF Export | Puppeteer | Headless Chrome |
| Error Monitor | Sentry (@sentry/nextjs) | |
| Uptime | UptimeRobot | /api/health, 5-min interval |
| CDN | Cloudflare | ~40% cache, DDoS protection |
| Process Manager | PM2 | Cluster mode |
| CI/CD | GitHub Actions | Lint/type-check on PR, cron jobs |
| BS Calendar | bikram-sambat (npm) | AD↔BS conversion |

---

## 4. Architecture

### Infrastructure (General)
- **App Server**: DigitalOcean, Ubuntu 22.04 LTS, 2GB RAM, Next.js via PM2
- **Web Server**: Nginx reverse proxy (port 80/443 → 3000)
- **CDN**: Cloudflare (all traffic proxied)
- **DNS**: Cloudflare — www redirects to non-www (301)
- **Storage**: Cloudflare R2 for all PDF drawings

> ⚠️ Server credentials and exact IPs are in a separate private infrastructure document.

### Request Flow
```
User → Cloudflare (CDN/SSL) → Nginx → PM2/Next.js
  ├── Prisma → MySQL
  ├── Redis (sessions, rate limiting, BOQ cache)
  ├── Cloudflare R2 (files)
  └── Socket.io → Redis adapter → all PM2 workers → all clients
```

### Multi-Tenancy
Every data model has `orgId`. `withTenantGuard(userId, resource.orgId)` is called on every API route — throws 403 on mismatch. cuid() IDs prevent URL enumeration.

### Custom Server (`server.js`)
The app runs on a custom Node.js HTTP server (`server.js`) rather than the standard Next.js server. This is required to attach Socket.io to the same HTTP server. PM2 runs `node server.js` in cluster mode. The custom server:
- Creates the HTTP server
- Initialises Socket.io with the Redis pub/sub adapter (required for PM2 multi-worker)
- Attaches auth middleware to every Socket.io connection (reads NextAuth JWT from cookie)
- Handles all real-time events
- Passes all other requests to Next.js's `handle()`

---

## 5. User Roles

| Role | Scope | Key Permissions |
|------|-------|----------------|
| SUPER_ADMIN | Platform | Manage all orgs, plans, DUDBC rates, site config |
| OWNER | Organisation | All org permissions, billing, approve overrides |
| ADMIN | Organisation | Invite users, create/archive projects, approve overrides |
| MEMBER | Assigned projects | Takeoff, BOQ items, propose overrides (cannot approve) |

---

## 6. Security (Non-Negotiable)

- **Auth**: bcrypt cost 12, JWT (15min) + httpOnly refresh cookie (7d), Redis session store, refresh token rotation
- **Multi-tenancy**: `withTenantGuard()` on every API route, Prisma orgId filter
- **Validation**: Zod on every route, parameterised Prisma queries only
- **Rate limiting**: Login 5/15min, Upload 5/user/hr, API 120/user/min
- **Files**: Pre-signed R2 URLs, pdf-lib server validation, max 50MB/100 pages, private signed download URLs
- **Headers**: CSP, X-Frame-Options, HSTS, Referrer-Policy via middleware
- **Audit**: Append-only AuditLog table — immutable, even for SUPER_ADMIN
- **Monitoring**: Sentry all unhandled errors, UptimeRobot /api/health every 5min
- **Excel injection prevention**: `sanitizeCell()` in `lib/export.ts` prefixes any value starting with `=`, `+`, `-`, `@`, tab, or carriage return with a space

### Known Security Issues

1. **Socket.io CORS wildcard** — ✅ Fixed (commit 9355b3b): `origin` restricted to `"https://estimatenepal.com"`.

2. **Socket.io shape events relayed without org verification** — ✅ Fixed (commit 5eef2a7): All 5 shape/lock events now check `joinedRooms.has(roomId)` before relaying. `joinedRooms` is only populated after the `join:room` tenant guard passes, so a cross-org socket can never relay events.

3. **Socket.io events not server-side rate-limited** — ✅ Fixed (commit e4adc38): Per-socket `allow()` rate limiter added; `cursor:move` capped at 20/sec, all shape and lock events at 10/sec.

---

## 7. Database Schema

Schema file: `prisma/schema.prisma` — **single source of truth**.

### Key Models

**User** — `id, name, email, passwordHash, emailVerified, role, orgId, referralSource, referralMedium, referralCampaign, npsSentAt, npsScore, lastLoginAt, isTestAccount`
- `role`: OWNER | ADMIN | MEMBER
- `isSuperAdmin`: separate boolean flag

**Org** — `id, name, planTier, trialEndsAt, plan, panNumber, logoUrl, storageUsedBytes, churnReason, adminNotes`
- `planTier`: TRIAL | SOLO | TEAM | ENTERPRISE

**Project** — `id, name, clientName, clientCompany, district, status, priority, vatRate, tdsRate, contingencyPct, exportConfig, projectNumber, orgId, isPricingLocked, squareFootage, estimatedValue, bidDueDate, scopeOfWork`
- `exportConfig`: JSON — BOQ column visibility, custom columns, column order
- `status`: ESTIMATING | BID_SUBMITTED | ACCEPTED | IN_PROGRESS | COMPLETE | LOST | ARCHIVED

**Drawing** — `id, projectId, fileName, fileUrl, folderId, revisionNumber, isLatest`

**DrawingPage** — `id, drawingId, pageNumber, label, scale (Float?), scaleUnit, canvasJson, annotationsJson`
- `canvasJson`: legacy field — do NOT write new data here
- `annotationsJson`: stores `{ annotations: Annotation[] }` — all markup layers

**ScaleZone** — `id, pageId, label, x, y, width, height, scale, scaleUnit`
- A rectangular region on a page with its own independent scale

**TakeoffGroup** — `id, projectId, disciplineId, parentId, name, type, colour, lineWidth, multiplier, additionalParams, rateItemId, isLocked, isVisible, sortOrder, preamble`
- Two-level hierarchy: parent = category (no items), child = layer (has items)
- `type`: LINEAR | AREA | VOLUME | VERTICAL_WALL_AREA | COUNT | COUNT_BY_DISTANCE
- `additionalParams`: JSON — wall height, volume method, breadth, height, spacing
- `rateItemId`: links the layer to a rate item for BOQ pricing

**TakeoffItem** — `id, pageId, groupId, label, toolType, shapeType, toolData, quantity, rawQuantity, unit, scaleUsed, isNegative, multiplier, wastagePct, siteLocation, measuredDate, notes, version`
- `toolData`: JSON `{ points: { x, y }[] }` — raw canvas pixel coordinates
- `rawQuantity`: intrinsic measurement (length ft, area sq ft) — no multiplier or wall height baked in
- `quantity`: display quantity (rawQuantity × multiplier, or with wall height applied)
- `isNegative`: true = this item is subtracted from the group total (deduction)
- `version`: optimistic lock integer — server rejects save if client version differs

**RateItem** — `id, code, description, unit, baseRate, fiscalYear, source, orgId, batchId`
- `source`: DUDBC | DISTRICT | CUSTOM
- `orgId` null = platform-wide DUDBC rate

**RateAnalysis** — `id, projectId, rateItemId, materialCost, skilledLabour, semiSkilledLabour, unskilledLabour, equipmentCost, overheadPct, profitPct, wastagePct, computedRate, useComputedRate`

**BOQOverride** — `id, projectId, rateItemId, field, proposedValue, approvedValue, status, submittedBy`
- `field`: "rate" or "description"
- `status`: PENDING | APPROVED | REJECTED
- Most-recent APPROVED override per rateItemId wins

**AnalyticsEvent** — `id, orgId, userId, event, meta, createdAt`

**PendingPayment** — `id, email, planKey, billing, amount, orgId, status`

**SiteConfig** — `key (PK), value, description`

**Coupon** — `id, code, durationDays, planTier, redeemedByOrg`

**Assembly / AssemblyGroup** — template library for reusable takeoff groups (UI partial, models ready)

**DrawingComment** — `id, drawingPageId, userId, x, y, text` — pinned comment at canvas coordinates

**ProjectNote / ProjectTask / ChangeOrder / RetentionRelease / SubcontractorQuote** — project management models

---

## 8. Scale System (`lib/scale.ts`)

### Constants
- `RENDER_DPI = 144` — PDF.js renders at 144 px/inch (72 DPI × render scale factor 2)
- All pixel coordinates in `TakeoffItem.toolData` are at this resolution

### Scale Value
The stored scale is `realWorldUnits / px` — e.g. `0.0556` ft/px means 1 pixel = 0.0556 feet.

**Formula:**
```
scale_ft_per_px = ftPerDrawingInch / RENDER_DPI
```
Where `ftPerDrawingInch` is from the scale preset (e.g. `1/8"=1'` → 8 ft per drawing inch).

### Calibration (Manual)
User draws a reference line on the PDF, types in the known real-world length:
```
scale = knownRealLength / pixelLength
```
Implemented in `computeScale(pixelLength, realLength)`.

### Preset Scales
`COMMON_SCALES` in `lib/scale.ts` covers:
- **Architectural**: 1/128"=1' through 3"=1'
- **Civil**: 1"=10' through 1"=1000'

`presetToFtPerPx(preset)` converts any preset to the stored scale value.
`findPresetLabel(scale, scaleUnit)` does a reverse lookup (±0.1% tolerance).

### Scale Zones (`ScaleZone` model)
A page can have multiple rectangular scale zones. When computing quantity for a shape:
1. Calculate the centroid of all shape points
2. Check if the centroid falls inside any zone
3. Use the zone's scale if found, otherwise use the page-level scale
4. If no scale at all — return `{ quantity: 0 }` and show "Not set"

Implemented in `effectiveScale(points, pageScale, pageScaleUnit, scaleZones)` in `lib/takeoff.ts`.

---

## 9. Canvas Architecture (`components/canvas/DrawingCanvas.tsx`)

### Layer Stack (Konva)
| Layer Index | Content | Notes |
|-------------|---------|-------|
| 0 | PDF background | Static `KonvaImage`, cached per page |
| 1 | Scale zone rectangles | Dashed outlines, label text |
| 2 | Takeoff shapes | Lines, polygons, circles, arcs, count dots |
| 3 | Markup / annotations | Pen strokes, arrows, highlights, text |
| 4 | UI overlays | Snap indicators, rubber-band selection, node edit handles, cursor labels |

### Tool Modes
14 modes — set via `mode` state in `DrawingCanvas`:

| Mode | Tool Group | What It Does |
|------|-----------|-------------|
| `select` | Navigation | Click to select, drag to rubber-band multi-select, right/middle click to pan |
| `calibrate` | Setup | Draw reference line → enter known length to set page scale |
| `zone` | Setup | Drag rectangle to define a local scale zone |
| `polyline` | Takeoff | Click points to draw lines/polygons. Double-click to close polygon. Used for LINEAR, AREA, VOLUME, VERTICAL_WALL_AREA, COUNT_BY_DISTANCE |
| `rectangle` | Takeoff | Drag to draw rectangle. Used for all area/volume types |
| `circle` | Takeoff | Click centre → drag to set radius |
| `arc` | Takeoff | 3 clicks: start point → end point → midpoint on arc |
| `count` | Takeoff | Each click places a count dot |
| `measure` | Utility | Temporary ruler — never saved, no quantity contribution |
| `pen` | Markup | Freehand stroke stored in annotationsJson |
| `markup-text` | Markup | Click to place text label |
| `highlight` | Markup | Drag rectangle highlight |
| `arrow` | Markup | Drag to draw arrow |
| `xline` | Markup | Drag to draw straight line |
| `comment` | Markup | Click to place a pinned comment |

**Auto-mode switch**: When user selects a TakeoffGroup (layer) in the left panel, the mode auto-switches:
- COUNT type → `count` mode
- All other types → `polyline` mode
- Locked layer → stays in `select` mode

### Shape Data Structures

All shapes store `toolData: { points: Point[] }` where `Point = { x, y }` in canvas pixels (at RENDER_DPI=144).

| Shape | ShapeType | Points Layout |
|-------|-----------|--------------|
| Polyline (open) | `POLYLINE` | [p0, p1, p2, …] — sequence of vertices |
| Polygon (closed) | `POLYGON` | [p0, p1, p2, …] — auto-closes p_last→p0 |
| Rectangle | `RECTANGLE` | [topLeft, topRight, bottomRight, bottomLeft] — 4 corners |
| Circle | `CIRCLE` | [center, edgePoint] — exactly 2 points |
| Arc | `ARC` | [startPoint, endPoint, midpointOnArc] — exactly 3 points |
| Count dot | (no shapeType) | [dot0, dot1, …] — each point is one item |

### Snap System
- Snap radius: 8px
- Snaps to: endpoints of existing shapes, midpoints, page corners
- Visual indicator shown on layer 4
- Active in polyline, rectangle, arc, count modes

### Node Editing
After selecting a shape in `select` mode, drag any vertex handle to reposition it. The updated `toolData.points` is saved with a debounced PUT request.

### History (Undo/Redo)
- Max 30 states (`MAX_HISTORY = 30`)
- Ctrl+Z / Ctrl+Shift+Z
- Separate history stacks for takeoff items and annotations

### Touch Support
- Single finger: pan
- Two fingers (pinch): zoom (scale range: 0.05× to 20×)
- Implemented with `handleTouchStart` / `handleTouchMove` / `handleTouchEnd`

### Resizable Sidebar
- Width: 180px–480px, default 224px
- Drag handle to resize, persisted to `localStorage`
- Auto-collapses on screens < 768px

---

## 10. Quantity Calculation (`lib/takeoff.ts`)

All shapes compute two values:
- `rawQuantity` — the intrinsic geometric measurement (length, area) without multiplier or wall height. This is what gets stored in `TakeoffItem.rawQuantity` so that changing wall height later doesn't require re-saving all items.
- `quantity` — the final displayed value (rawQuantity × multiplier, with wall height/breadth applied)

### `computeQuantity(toolType, toolData, scale, scaleUnit, multiplier, additionalParams?, shapeType?)`

**LINEAR**
```
rawPx = polylineLength(points)          // for POLYLINE
rawPx = 2π × circleRadius(pts)          // for CIRCLE
rawPx = arcLength(pts)                   // for ARC (circumscribed circle method)
rawPx = perimeterOfPolygon(pts)         // for RECTANGLE
rawQuantity = rawPx × scale
quantity = rawQuantity × multiplier
unit = scaleUnit ("ft" or "m")
```

**COUNT_BY_DISTANCE**
```
Same length computation as LINEAR.
count = floor(length / spacingFt) + 1
quantity = count × multiplier
unit = "each"
// If spacing not set: returns length with "(set spacing)" hint in unit string
```

**AREA**
```
// CIRCLE: rawPx2 = π × r²
// Others: Shoelace formula (polygonArea)
rawQuantity = rawPx2 × scale × scale
quantity = rawQuantity × multiplier
unit = "sq ft" or "sq m"
```

**VERTICAL_WALL_AREA**
```
perimPx = perimeter of path (same as LINEAR)
perimeterReal = perimPx × scale
wallH = heightFt + heightIn/12
rawQuantity = perimeterReal    // rawQuantity is just perimeter, NOT the area
quantity = perimeterReal × wallH × multiplier
unit = "sq ft" or "sq m"
// If wall height not set: returns perimeter with "(set wall height)" hint
```

**COUNT**
```
rawQuantity = points.length
quantity = points.length × multiplier
unit = "each"
```

**VOLUME**
Two sub-methods controlled by `additionalParams.volumeMethod`:

`area_x_h` (default — use for rectangular/polygon floor plans):
```
rawQuantity = polygonArea(pts) × scale²    // or π×r² for CIRCLE
heightFt = h.ft + h.in/12
quantity = rawQuantity × heightFt × multiplier
unit = "cu ft" or "cu m"
```

`lbh` (L×B×H — use for linear shapes like beams/footings):
```
rawQuantity = polylineLength(pts) × scale
breadthFt = b.ft + b.in/12
heightFt = h.ft + h.in/12
quantity = rawQuantity × breadthFt × heightFt × multiplier
unit = "cu ft" or "cu m"
```

### Key Helper Functions

`polylineLength(points)` — sum of Euclidean distances between consecutive points.

`polygonArea(points)` — Shoelace (Gauss) formula: `|Σ(xᵢyᵢ₊₁ - xᵢ₊₁yᵢ)| / 2`.

`circleRadiusPx(pts)` — Euclidean distance from `pts[0]` (center) to `pts[1]` (edge).

`arcLengthPx(pts)` — Three-point circumscribed circle: finds center and radius from A, B, C, computes the sweep angle that puts C on the arc, returns `radius × sweep`. Falls back to straight line if points are collinear.

`effectiveScale(points, pageScale, pageScaleUnit, scaleZones)` — centroid-based zone lookup (see §8).

---

## 11. BOQ Generation (`lib/boq.ts`)

### Overview
`generateBOQ(projectId)` → `BOQDocument` — called by all export routes. Result is cached in Redis for 30 seconds (`boq:${projectId}`). Call `invalidateBOQCache(projectId)` after any takeoff change.

### Data Hierarchy
```
BOQDocument
  └── disciplines[]         (from Discipline model, ordered by sortOrder)
        └── groups[]        (from TakeoffGroup where parentId != null)
              ├── items[]   (from TakeoffItem, ordered by sortOrder)
              ├── totalQuantity
              ├── rate       (district rate → base rate → override → computed)
              └── amount = totalQuantity × rate
```

### Quantity Computation in BOQ (Re-derived from rawQuantity)

The BOQ does NOT use `TakeoffItem.quantity`. It recomputes from `rawQuantity` using the group's current `additionalParams`. This means changing wall height on a group instantly updates all items without re-saving them.

**VOLUME (area_x_h):**
```
// Filter to area-based shapes only (RECTANGLE, CIRCLE, POLYGON)
rawTotal = Σ(item.isNegative ? -item.rawQuantity : item.rawQuantity)
totalQuantity = rawTotal × heightFt × group.multiplier
unit = heightFt > 0 ? "cu ft" : "sq ft"
```

**VOLUME (lbh):**
```
// Filter to length-based shapes only (POLYLINE, ARC, null shapeType)
rawTotal = Σ(item.isNegative ? -item.rawQuantity : item.rawQuantity)
totalQuantity = rawTotal × breadthFt × heightFt × group.multiplier
unit = (b > 0 && h > 0) ? "cu ft" : "sq ft"
```

**VERTICAL_WALL_AREA:**
```
rawTotal = Σ(item.isNegative ? -item.rawQuantity : item.rawQuantity)
totalQuantity = wallH > 0 ? rawTotal × wallH × group.multiplier : 0
unit = wallH > 0 ? "sq ft" : "ft"
```

**COUNT_BY_DISTANCE:**
```
// Per-item: count = floor(item.rawQuantity / spacingFt) + 1
totalQuantity = Σ(count_per_item) × group.multiplier
unit = "each"
```

**COUNT / LINEAR / AREA:**
```
rawTotal = Σ(item.isNegative ? -item.rawQuantity : item.rawQuantity)
totalQuantity = rawTotal × group.multiplier
unit = from items[0].unit (with "(set …)" hints stripped)
```

> **Known Bug**: VOLUME and VERTICAL_WALL_AREA units are hardcoded to "cu ft"/"sq ft"/"ft" regardless of the project's unit system. Projects using meters will show incorrect units in the BOQ. Fix: read `scaleUnit` from items or project `unitSystem`.

### Rate Priority (highest wins)
1. `analysis.computedRate` if `RateAnalysis.useComputedRate = true`
2. `districtRateMap.get(rateItemId)` — district-specific rate for the project's district
3. `rateItem.baseRate` — platform base rate
4. `BOQOverride` with `status=APPROVED` and `field="rate"` — manual override (shown yellow in exports)
5. 0 if no rate item linked

### Financial Calculations
```
grandTotal = Σ discipline.subtotal
contingencyAmount = grandTotal × (contingencyPct / 100)
provisionalSum = project.provisionalSum (fixed amount)
subtotalAfterAdditions = grandTotal + contingencyAmount + provisionalSum
vatAmount = vatEnabled ? subtotalAfterAdditions × (vatRate / 100) : 0
tdsAmount = tdsEnabled ? subtotalAfterAdditions × (tdsRate / 100) : 0
finalPayable = subtotalAfterAdditions + vatAmount - tdsAmount
```
TDS is deducted (withheld at source). VAT is added. Standard Nepal construction billing.

---

## 12. Rate Analysis (`lib/rateAnalysis.ts`)

`computeCompositeRate(input)` calculates the build-up rate for a work item:

```
materialWithWastage = materialCost × (1 + wastagePct/100)
totalLabour = skilledLabour + semiSkilledLabour + unskilledLabour
baseTotal = materialWithWastage + totalLabour + equipmentCost
overheadAmount = baseTotal × (overheadPct/100)
afterOverhead = baseTotal + overheadAmount
profitAmount = afterOverhead × (profitPct/100)
computedRate = afterOverhead + profitAmount
```

When `RateAnalysis.useComputedRate = true`, the BOQ uses `computedRate` instead of the base rate.

---

## 13. Export System (`lib/export.ts`)

### Export Types

| Type | Function | Format |
|------|----------|--------|
| Standard BOQ | `buildBOQExcel(boq, cols)` | Excel (.xlsx) |
| Standard BOQ | `buildBOQPdf(boq)` | PDF via Puppeteer |
| Measurement Book | `buildMBExcel(boq)` | Excel (.xlsx) |
| Government BOQ | `buildGovtBOQExcel(boq, meta)` | Excel (.xlsx) |

### Standard BOQ Excel (`buildBOQExcel`)
- **Sheet 1 (Summary BOQ)**: All disciplines with sub-totals, financial summary
- **Sheet 2–N (per discipline)**: Full measurement book breakdown — No., Length, Breadth, Height, Quantity, Unit, Rate, Amount
- Column visibility controlled by `ExportColConfig`: `showSno, showUnit, showQty, showRate, showAmount, customCols[]`
- Overridden rates shown with yellow fill
- Custom columns appended as blank user-fillable columns

### Measurement Book Excel (`buildMBExcel`)
- Single sheet with all disciplines
- Extra columns: Site Location, Measured Date, Remarks
- Data from `TakeoffItem.siteLocation`, `measuredDate`, `notes`

### Government BOQ (`buildGovtBOQExcel`)
- Full bilingual (Nepali/English) header
- Metadata: Ministry, Department, Office, Scheme No., District, Ward No., Fiscal Year, Contractor
- Bilingual column headers (Nepali on row 1, English on row 2)
- "जम्मा / Total" row per group
- "उप-जम्मा / Sub-total" row per discipline
- Financial summary: Grand Total, Contingency, Provisional Sum, VAT
- Signature block: Prepared / Checked / Approved (with bilingual labels)
- DUDBC disclaimer footer

### `GovtBOQMeta` fields
```typescript
{
  ministry?: string;       // default: "शहरी विकास मन्त्रालय / Ministry of Urban Development"
  department?: string;     // default: "DUDBC"
  office?: string;
  projectName: string;     // required
  schemeNo?: string;
  district?: string;
  ward?: string;
  fiscalYear?: string;     // e.g. "2081/82"
  contractorName?: string;
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
}
```

### PDF Export (`buildBOQPdf`)
- Puppeteer headless Chrome
- Renders `buildBOQHtml()` output
- A4 format, 15mm top/bottom margin, 10mm left/right margin
- `--no-sandbox` flag required for DigitalOcean server

### Excel Injection Prevention
`sanitizeCell(s)` prefixes `=`, `+`, `-`, `@`, `\t`, `\r` with a space to prevent formula injection.

---

## 14. Markup / Annotations (`components/canvas/types.ts`)

Annotations are stored in `DrawingPage.annotationsJson.annotations[]`. Never stored in the database as separate rows.

```typescript
type Annotation =
  | { id, type: "pen",       points: number[], color, strokeWidth }
  | { id, type: "text",      x, y, text, color, fontSize }
  | { id, type: "highlight", x, y, width, height, color }
  | { id, type: "arrow",     x1, y1, x2, y2, color, strokeWidth }
  | { id, type: "xline",     x1, y1, x2, y2, color, strokeWidth }
```

`pen` points are a flat `[x0, y0, x1, y1, …]` array (Konva Line format).

Annotation history is separate from takeoff history (separate undo stack, max 30 states). Annotations are saved with a 1-second debounce to `PATCH /api/projects/[id]/drawings/[drawingId]/pages/[pageId]`.

---

## 15. Real-Time Collaboration (`server.js` + `lib/socket.ts`)

### Architecture
- Custom Node.js HTTP server with Socket.io attached
- Redis pub/sub adapter (`@socket.io/redis-adapter`) required for PM2 cluster mode
- Without the Redis adapter, each PM2 worker has its own socket registry — events from users on worker A never reach users on worker B

### Room ID Format
```
roomId = `${disciplineId}__${pageId}`
```
Client calls `getSocket()` from `lib/socket.ts` (singleton), then emits `join:room` with this roomId.

### Auth Middleware
Every socket connection runs the auth middleware:
1. Reads `__Secure-next-auth.session-token` (prod) or `next-auth.session-token` (dev) from cookie
2. Decodes NextAuth JWT using `NEXTAUTH_SECRET`
3. Sets `socket.data.userId`, `socket.data.userName`, `socket.data.orgId`
4. Falls back to `socket.handshake.auth.userId` (client-supplied, for presence display only — not trusted for auth)

### Tenant Guard on `join:room`
Before joining: parses `disciplineId` from roomId, looks up `Discipline.project.orgId` in MySQL, rejects if `orgId !== socket.data.orgId`.

### Full Event Catalog

**Client → Server:**

| Event | Payload | Description |
|-------|---------|-------------|
| `join:room` | `roomId: string` | Join a drawing page room |
| `leave:room` | `roomId: string` | Leave a room |
| `cursor:move` | `{ roomId, x, y }` | Broadcast cursor position (throttled on client) |
| `shape:lock` | `{ roomId, itemId }` | Lock a shape for editing |
| `shape:unlock` | `{ roomId, itemId }` | Release a shape lock |
| `takeoff:add` | `{ roomId, item: TakeoffItem }` | Notify peers of new shape |
| `takeoff:update` | `{ roomId, item: TakeoffItem }` | Notify peers of shape update |
| `takeoff:delete` | `{ roomId, itemId: string }` | Notify peers of shape deletion |

**Server → Client:**

| Event | Payload | Description |
|-------|---------|-------------|
| `presence:update` | `ActiveUser[]` | Current users in room (on join/leave) |
| `shape:locks:init` | `{ itemId, userId, name }[]` | Current lock state on room join |
| `cursor:move` | `{ socketId, userId, name, x, y }` | Another user's cursor |
| `shape:lock` | `{ itemId, userId, name }` | Shape locked by another user |
| `shape:unlock` | `itemId: string` | Shape lock released |
| `takeoff:add` | `TakeoffItem` | New shape from another user |
| `takeoff:update` | `TakeoffItem` | Updated shape from another user |
| `takeoff:delete` | `itemId: string` | Deleted shape from another user |

### Lock-on-Select Behaviour
- When a user selects a single item in `select` mode: client emits `shape:lock`
- Server sets a 30-second auto-release timeout per lock
- On deselect/mode change: client emits `shape:unlock`
- On disconnect: server releases all locks held by that socket
- Locked shapes show the lock holder's name to other users; cannot be moved/deleted by others
- Implementation: in-memory Maps on server (`roomLocks`, `lockTimeouts`); not persisted across server restarts

### Presence
- Each room tracks `roomPresence: Map<roomId, Map<socketId, { userId, name, initials }>>` in server memory
- Avatar colour is derived from userId via hash — same user always gets same colour
- Presence is reset on server restart (acceptable for real-time collaboration)

### Connection Resilience
- On reconnect: client calls `refreshItems()` to re-fetch latest items from DB
- `socketConnected` state drives a visual indicator in the UI

---

## 16. Email Lifecycle (`app/api/cron/trial-reminder/route.ts`)

| Trigger | Window | Subject |
|---------|--------|---------|
| Day 7 check-in | org created 7–8 days ago, still TRIAL | "How's your Estimate Nepal trial going?" |
| Day 12 urgency | trial ends in 2–3 days | "2 days left on your Estimate Nepal trial" |
| 3-day reminder | trial ends in 3–4 days | "Your Estimate Nepal trial ends in 3 days" |
| Trial expired | trial ended in last 24 hours | "Your trial has ended — upgrade to continue" |
| Churn reason | trial expired 2–3 days ago, no upgrade, no churnReason | "One quick question about your trial" |
| NPS | user created 7–8 days ago, `npsSentAt` is null | "Quick question — how's Estimate Nepal working for you?" |

**CRON_SECRET protection**: `Authorization: Bearer ${CRON_SECRET}` header required.

**Redis rate-limit**: `cron:trial-reminder:last_run` key with 1-hour TTL — prevents accidental double-send if cron fires twice within one hour.

**Churn feedback URLs**: 4-option 1-click links. URL includes `org=${orgId}&key=${hmacKey}`. HMAC key is 20-char hex from `createHmac("sha256", NEXTAUTH_SECRET).update(orgId).digest("hex").slice(0,20)`.

**NPS URLs**: Scores 0–10 as separate links, same HMAC pattern with userId.

**Schedule**: GitHub Actions, daily at 7:15 AM NPT (`app/.github/workflows/cron.yml`).

---

## 17. Environment Variables

```env
DATABASE_URL=mysql://...
REDIS_URL=redis://...
NEXTAUTH_SECRET=<32+ char random>
NEXTAUTH_URL=https://estimatenepal.com
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_BUCKET=nepaliestimate-files
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_REGION=auto
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@estimatenepal.com
CRON_SECRET=<random secret>
NEXT_PUBLIC_SENTRY_DSN=https://...@...ingest.de.sentry.io/...
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX  # optional
```

---

## 18. Developer Setup

```bash
# Clone and install
git clone https://github.com/[org]/nepali-estimate.git
cd nepali-estimate
npm install

# Environment
cp .env.example .env.local
# Fill in DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000

# Database
npx prisma db push   # sync schema
npx prisma db seed   # create SUPER_ADMIN

# Dev server (uses custom server.js, not next dev)
node server.js       # http://localhost:3000
# OR for hot reload:
npm run dev
```

### Production Deploy
```bash
# Run from /var/www/nepaliestimate on server
git pull origin main
npm install
npm run build
pm2 restart all --update-env
```

---

## 19. Remaining Roadmap

### Phase 7 — Nepali Language
Next.js i18n routing, full UI translation to नेपाली, Devanagari PDF fonts, BS calendar default.

### Phase 8 — DUDBC Rate Database
Superadmin manages rates by fiscal year. District overrides (77 districts). CSV bulk import. Immutable published rates. Migration banner for new fiscal year.
> DistrictRate model already exists in schema.

### Phase 9 — Online Payments & Tender Package
eSewa + Khalti integration. Tender PDF bundle (cover, letterhead, scope, BOQ, rates). Full quote comparison. Assembly library completion.

---

## 20. Known Bugs & Improvements

### Bugs

**B1 — VOLUME/VERTICAL_WALL_AREA unit hardcoded to imperial** (`lib/boq.ts` lines 222–232): ✅ Fixed (commit e4adc38)
Units now derived from `layer.items[0]?.unit` — metric projects correctly display "cu m"/"sq m" instead of hardcoded "cu ft"/"sq ft".

**B2 — Wrong filename convention**: ✅ Verified clean (no fix needed)
No imports of `lib/quantity.ts` exist anywhere in the codebase. The correct file is `lib/takeoff.ts`. Convention note retained for future developers: do not create a `lib/quantity.ts`.

**B3 — Invalid override fallback ignores computedRate** (`lib/boq.ts` lines 276–280):
When an approved rate override has an invalid value (NaN or negative), the fallback uses `districtRate ?? baseRate` even if `useComputedRate=true`. Edge case only.

### UX Improvements (Suggested)

**U1 — No polygon/area mode distinction in toolbar**: The `polyline` mode draws both open polylines and closed polygons (double-click closes). This is not obvious in the UI. Consider separate "Polygon" and "Polyline" buttons.

**U2 — COUNT_BY_DISTANCE spacing in feet only**: The UI input accepts `ft + in` but does not support meters for metric projects.

**U3 — Snap radius is fixed at 8px**: Not configurable. On very small screens or highly zoomed out views, snapping can feel too aggressive.

**U4 — Undo history resets on page change**: Switching pages clears the undo stack. Expected but potentially surprising.

**U5 — No visual indicator when scale is not set**: If no page scale and no matching zone, `computeQuantity` returns 0 silently. The unit string gets a hint like "(set spacing)" for spacing, but the zero-scale case has no hint.

---

## 21. Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Auth | NextAuth.js | No vendor dependency |
| File storage | Cloudflare R2 | No egress cost |
| Email | Resend | Good deliverability, domain verified |
| Excel | ExcelJS | Formula strings + cell comments |
| PDF | Puppeteer | Best BOQ table formatting |
| BS calendar | bikram-sambat | Best maintained |
| OCR | Tesseract.js (server) | No client bundle, Nepali support |
| Real-time | Socket.io + Redis | Nepal network resilience |
| Conflict resolution | Lock-on-select | Simpler than OT/CRDT |
| Canvas performance | 5-layer + viewport culling | Foundational, cannot retrofit |
| rawQuantity storage | Separate from quantity | Wall height changes don't require re-saving items |
| Payment | Manual/WhatsApp | Fastest Nepal launch |
| IDs | cuid() | Non-sequential, non-guessable |
| BOQ cache | 30s Redis TTL | Batch export calls without staleness risk |

---

*Document version 4.0 — July 2026. Update version and date when making significant changes. Infrastructure credentials are in a separate private document.*
