# Security — Non-Negotiable Rules

> Read this before building any feature that stores user data, handles file uploads, processes external input, or exposes data to unauthenticated users.

---

## 1. Multi-tenancy — the most critical rule

Every data model has `orgId`. Every API route MUST call:
```typescript
await withTenantGuard(userId, resource.orgId);
```
This throws 403 if the user's org does not match the resource's org. There are no exceptions. A missing `withTenantGuard` call is a data isolation breach.

Pattern for every route handler:
```typescript
const session = await getServerSession(authOptions);
if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const resource = await prisma.someModel.findUnique({ where: { id: params.id } });
if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

await withTenantGuard(session.user.id, resource.orgId); // throws 403 on mismatch
```

Use `cuid()` IDs everywhere — they are non-sequential and prevent URL enumeration attacks.

---

## 2. Input validation

Every API route must validate its request body with Zod before touching the database:
```typescript
const body = RequestSchema.parse(await req.json());
```
Use `safeParse` when you need to return a custom error response instead of letting Zod throw.

Never use raw `req.json()` data directly in Prisma queries without parsing through a schema first.

---

## 3. Rate limiting

Apply the correct limiter from `lib/security.ts` at the top of every route:

| Route type | Limiter | Limit |
|---|---|---|
| Login | `checkLoginRateLimit` | 10 failures / 15 min per IP:email |
| File upload | `checkUploadRateLimit` | 30 uploads / hour per IP |
| Export (Excel/PDF) | `checkExportRateLimit` | 10 exports / min per IP |
| OCR | `checkOcrRateLimit` | 20 requests / min per IP |
| Coupon redemption | `checkCouponRateLimit` | 5 attempts / hour per orgId |
| General API | `checkApiRateLimit` | 300 requests / min per IP |

All rate limiters have Redis + in-memory fallback. Redis failure falls open (does not block the request) — never let Redis downtime take down the API.

---

## 4. File upload security

- Verify MIME type server-side — never trust the `Content-Type` header from the client alone. Inspect file bytes (magic numbers) if feasible.
- Maximum file size: 50 MB per PDF upload, enforced in the upload route before the R2 write.
- Maximum pages: 100 pages per PDF.
- Pre-signed R2 URLs only — never expose R2 credentials to the client. Generate pre-signed download URLs with a short TTL (15 minutes).
- Rate limit uploads: `checkUploadRateLimit` (30/hour per IP).
- Never serve user-uploaded files directly through the Next.js server — always serve through R2 pre-signed URLs.

---

## 5. Excel/CSV injection prevention

Any value written to an Excel cell must go through `sanitizeCell()` from `lib/export.ts`. This prefixes values starting with `=`, `+`, `-`, `@`, tab, or carriage return with a space — preventing formula injection when recipients open exports in Excel.

This applies to ALL six export routes:
- `/api/projects/[id]/boq/export/excel`
- `/api/projects/[id]/boq/export/pdf`
- `/api/projects/[id]/boq/export/govt`
- `/api/projects/[id]/boq/export/mb`
- `/api/projects/[id]/boq/export/tender`
- `/api/projects/[id]/boq/export/procurement`

Every cell value — project names, rate descriptions, client names, notes — must be sanitized before writing to ExcelJS.

---

## 6. Rate import security

The rate import route accepts `.xlsx` files from users. xlsx is an XML-based format with known attack vectors:
- Validate MIME type (must be `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
- Enforce file size limit (reject > 10 MB for rate files)
- Parse with ExcelJS in streaming mode where possible — never load the full buffer into memory for large files
- Sanitize every imported value: rate code, description, unit, baseRate — validate types strictly before writing to `RateItem`
- Never eval or execute any content from an imported file

---

## 7. Puppeteer (PDF export) — SSRF and XSS prevention

Puppeteer renders HTML to PDF for export routes. Rules:
- Never pass user-supplied URLs to `page.goto()` — always generate the HTML server-side and use `page.setContent()` or a localhost URL
- Any user content embedded in the PDF HTML (project names, descriptions, notes, rate descriptions) must be HTML-escaped before insertion — never use template literals with raw user strings in the HTML template
- Run Puppeteer with `--no-sandbox` only if required by the deployment environment and document why

---

## 8. Socket.io security

Socket.io handles real-time multi-user canvas collaboration. Rules:

**Auth:** Every socket connection must authenticate on connect by reading the NextAuth JWT from the cookie. The custom server (`server.js`) attaches auth middleware before any event handler runs. An unauthenticated socket must be disconnected immediately.

**Room isolation:** Room names use the format `drawing:${pageId}`. `pageId` values are cuid() — non-guessable. Before joining a room, the server must verify the user's org has access to that page (tenant guard). Only after a successful `join:room` is the socket added to `joinedRooms`.

**Event relay guard:** All shape/lock events check `joinedRooms.has(roomId)` before relaying. A socket that hasn't passed the tenant guard on `join:room` cannot receive or send events for that room.

**Rate limiting:** Per-socket limiters are applied server-side:
- `cursor:move` — 20 events/sec
- Shape events (create/update/delete) — 10 events/sec
- Lock events — 10 events/sec

**CORS:** The Socket.io `origin` is restricted to `"https://estimatenepal.com"` in production. Never set `origin: "*"`.

---

## 9. Share links (public/unauthenticated routes)

`ShareLink` tokens allow unauthenticated access to a project's BOQ for client approval. Rules:
- Share link tokens must be random, long (min 32 bytes), and stored hashed in the database
- The share link route must fetch ONLY data belonging to the share link's `projectId`
- Never expose rate values from other orgs — always filter by the specific project, never join across projects
- Share links should have an expiry (`expiresAt`) — never serve an expired link
- Never expose internal IDs, user emails, or org names in the share link response beyond what the client needs to see

---

## 10. BOQ Redis cache

The BOQ cache key must include `projectId`:
```typescript
const cacheKey = `boq:${projectId}`;
```

`invalidateBOQCache(projectId)` must be called after any write to:
- `TakeoffItem` (create, update, delete)
- `TakeoffGroup` (rate link, multiplier, additionalParams change)
- `RateItem` (rate change)
- `BOQOverride` (approval or rejection)
- `DistrictRate` (rate change)
- `EstimateLineOverride`

Missing a cache invalidation produces stale BOQ data shown to users. This is a correctness bug, not just a performance issue.

---

## 11. Security headers

Applied on every response via `getSecurityHeaders()` in `lib/headers.ts` and invoked in `middleware.ts`:
- `Content-Security-Policy` — restricts script, style, img, connect, frame sources
- `Strict-Transport-Security` — HSTS with 2-year max-age, includeSubDomains, preload
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables camera, microphone, geolocation

Never remove or weaken these headers.

---

## 12. Audit log

All destructive or sensitive actions must write to the `AuditLog` table:
- User role changes
- Project deletion or archival
- BOQ override approval/rejection
- Rate import (bulk changes to RateItem)
- Share link creation/revocation
- Superadmin impersonation

The `AuditLog` table is append-only — never delete or update rows, even as SUPER_ADMIN.

---

## 13. Superadmin routes

Every `/admin/*` route and `/api/admin/*` route must:
1. Verify `session.user.isSuperAdmin === true`
2. Return 403 for all other users — not 404

The superadmin check is in addition to, not instead of, the normal auth check.
