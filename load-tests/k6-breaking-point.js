/**
 * Breaking Point Discovery Test — estimatenepal.com
 * Grafana Cloud compatible (no local file reads)
 *
 * PURPOSE:
 *   Find exactly how many simultaneous users the server can handle before
 *   response times degrade and errors appear. Also confirms stable zones.
 *
 * USER TYPES SIMULATED (all active simultaneously, realistic proportions):
 *   35% — Takeoff workers     draw lines, measure quantities, view BOQ
 *   25% — Dashboard explorers browse projects, rates, assemblies, bid board
 *   15% — Landing page guests unauthenticated, public pages (homepage, login page)
 *   10% — Login wave          continuous new logins (new sessions)
 *   10% — Drawing viewers     upload/view PDF drawings
 *    5% — Exporters           PDF / Excel exports (CPU-heavy, least frequent)
 *
 * ESCALATION PLAN (auto-aborts when wall is hit):
 *   25 VUs  → hold 4 min  (baseline — must be rock solid)
 *   50 VUs  → hold 4 min  (comfortable zone)
 *   75 VUs  → hold 4 min  (moderate load)
 *  100 VUs  → hold 8 min  (max for free plan — longer hold to stress the server)
 *
 * HOW TO READ THE RESULT:
 *   — The VU count where P95 starts climbing above 1–2s  = warning zone
 *   — The VU count where test auto-aborts               = the wall
 *   — Everything below the wall with stable P95          = your safe capacity
 *   — If all stages pass with no abort, server handles 100 users of all types
 *     comfortably — upgrade plan to push beyond 100 VUs and find the true wall.
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ───────────────────────────────────────────────────────────
const loginSuccess   = new Rate("login_success");
const takeoffSuccess = new Rate("takeoff_success");
const exportSuccess  = new Rate("export_success");
const dashSuccess    = new Rate("dashboard_success");
const drawingSuccess = new Rate("drawing_success");
const landingSuccess = new Rate("landing_success");

const loginMs   = new Trend("login_ms");
const takeoffMs = new Trend("takeoff_ms");
const exportMs  = new Trend("export_ms");

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = "https://estimatenepal.com";
const DOMAIN   = "loadtest.estimatenepal.local";
const PASSWORD = "Demo@123456";
const users    = Array.from({ length: 200 }, (_, i) => ({
  email: `demo${String(i + 1).padStart(3, "0")}@${DOMAIN}`,
  password: PASSWORD,
}));

// ─── Per-VU state (module-level = persists across all iterations for same VU) ─
let vuPersona   = null;  // assigned once, never changes for this VU
let vuReady     = false; // true after first successful login
let vuProjectId = null;  // cached project ID after login

// ─── Escalating load stages ───────────────────────────────────────────────────
export const options = {
  scenarios: {
    all_users: {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 25  }, // ramp up
        { duration: "4m", target: 25  }, // HOLD — baseline, must be flawless
        { duration: "2m", target: 50  }, // ramp up
        { duration: "4m", target: 50  }, // HOLD — comfortable zone
        { duration: "2m", target: 75  }, // ramp up
        { duration: "4m", target: 75  }, // HOLD — moderate pressure
        { duration: "2m", target: 100 }, // ramp up
        { duration: "8m", target: 100 }, // HOLD longer — stress at max free-plan VUs
        { duration: "1m", target: 0   }, // cool down
      ],
    },
  },

  thresholds: {
    // Auto-abort: if P95 > 8s or error rate > 15% sustained, stop the test.
    // The VU count shown in Grafana at abort time = your breaking point.
    http_req_duration: [{ threshold: "p(95)<8000", abortOnFail: true }],
    http_req_failed:   [{ threshold: "rate<0.15",  abortOnFail: true }],

    // Informational per-feature thresholds — don't abort, just flag in report
    takeoff_success:   ["rate>0.85"],
    dashboard_success: ["rate>0.85"],
    drawing_success:   ["rate>0.80"],
    export_success:    ["rate>0.70"],
    login_success:     ["rate>0.80"],
    landing_success:   ["rate>0.90"],
    takeoff_ms:        ["p(95)<5000"],
    export_ms:         ["p(95)<20000"],
    login_ms:          ["p(95)<5000"],
  },
};

// ─── Persona assignment ───────────────────────────────────────────────────────
// Each VU is assigned one persona for its entire lifetime.
// Distribution matches real traffic proportions using VU number mod 20.
function assignPersona() {
  const roll = __VU % 20;
  if (roll <= 6)  return "takeoff";   // 35%  (rolls 0–6)
  if (roll <= 11) return "dashboard"; // 25%  (rolls 7–11)
  if (roll <= 14) return "landing";   // 15%  (rolls 12–14)
  if (roll <= 16) return "login";     // 10%  (rolls 15–16)
  if (roll <= 18) return "drawing";   // 10%  (rolls 17–18)
  return "export";                    //  5%  (roll 19)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }

function doLogin(vuIndex) {
  const user = users[vuIndex % users.length];

  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, { tags: { name: "csrf" } });
  if (csrfRes.status !== 200) return false;

  let csrfToken;
  try { csrfToken = JSON.parse(csrfRes.body).csrfToken; } catch { return false; }
  if (!csrfToken) return false;

  const t = Date.now();
  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(user.password)}&redirect=false&json=true`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirects: 5,
      tags: { name: "login" },
    }
  );
  loginMs.add(Date.now() - t);

  const ok = res.status === 200 && res.body && !res.body.includes('"error"');
  loginSuccess.add(ok);
  return ok;
}

function fetchProjectId() {
  const res = http.get(`${BASE_URL}/api/projects`, { tags: { name: "project_list" } });
  try {
    const projects = JSON.parse(res.body);
    if (Array.isArray(projects) && projects.length > 0) return projects[0].id;
  } catch {}
  return null;
}

// Demo accounts are seeded without projects — create one if the account has none.
function createProject() {
  const res = http.post(
    `${BASE_URL}/api/projects`,
    JSON.stringify({ name: `LT-VU${__VU}-${Date.now()}` }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "create_project" } }
  );
  try {
    const p = JSON.parse(res.body);
    return p.id || null;
  } catch {}
  return null;
}

// Logs in once and caches the project ID. Creates a project if the account has none.
function ensureReady() {
  if (vuReady) return true;
  const ok = doLogin(__VU - 1);
  if (!ok) return false;
  vuReady     = true;
  vuProjectId = fetchProjectId();
  if (!vuProjectId) vuProjectId = createProject();
  return true;
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export default function () {
  if (!vuPersona) vuPersona = assignPersona();

  switch (vuPersona) {
    case "takeoff":   runTakeoff();   break;
    case "dashboard": runDashboard(); break;
    case "landing":   runLanding();   break;
    case "login":     runLogin();     break;
    case "drawing":   runDrawing();   break;
    case "export":    runExport();    break;
  }
}

// ─── TAKEOFF WORKER (35%) ─────────────────────────────────────────────────────
// Simulates: open project → view disciplines → draw a measurement → check BOQ
function runTakeoff() {
  if (!ensureReady()) { sleep(rand(10, 20)); return; }

  group("Takeoff", () => {
    // Load workspace
    const t = Date.now();
    http.get(`${BASE_URL}/api/projects/${vuProjectId}`,             { tags: { name: "project_detail"  } });
    http.get(`${BASE_URL}/api/projects/${vuProjectId}/disciplines`, { tags: { name: "disciplines"     } });
    takeoffMs.add(Date.now() - t);
    sleep(rand(2, 5));

    // Load existing takeoff groups (the canvas items)
    const r1 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/takeoff-groups`, { tags: { name: "takeoff_groups" } });
    takeoffSuccess.add(r1.status === 200 || r1.status === 404);
    sleep(rand(2, 4)); // user studies the drawing

    // Draw a measurement (LINEAR = line, AREA = polygon, COUNT = click)
    const measureType = pick(["LINEAR", "AREA", "COUNT"]);
    const r2 = http.post(
      `${BASE_URL}/api/projects/${vuProjectId}/takeoff-groups`,
      JSON.stringify({ name: `Measure ${Date.now()}`, type: measureType, colour: "#3B82F6" }),
      { headers: { "Content-Type": "application/json" }, tags: { name: "draw_measurement" } }
    );
    takeoffSuccess.add(r2.status === 200 || r2.status === 201);
    sleep(rand(4, 8)); // user draws on canvas, moves mouse

    // BOQ auto-refreshes after every measurement
    const r3 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "boq_refresh" } });
    takeoffSuccess.add(r3.status === 200 || r3.status === 404);
    sleep(rand(5, 12)); // user reads quantities
  });
}

// ─── DASHBOARD EXPLORER (25%) ─────────────────────────────────────────────────
// Simulates: browse projects list → check rates → explore assemblies → bid board
function runDashboard() {
  if (!ensureReady()) { sleep(rand(10, 20)); return; }

  group("Dashboard", () => {
    const pages = [
      { path: "/dashboard",            name: "dash_home"    },
      { path: "/dashboard/projects",   name: "projects"     },
      { path: "/dashboard/rates",      name: "rates"        },
      { path: "/dashboard/bid-board",  name: "bid_board"    },
      { path: "/dashboard/assemblies", name: "assemblies"   },
      { path: "/dashboard/settings",   name: "settings"     },
    ];
    const apis = ["/api/notifications", "/api/orgs/me", "/api/projects"];

    const pageCount = Math.floor(rand(3, 6));
    for (let i = 0; i < pageCount; i++) {
      const page = pick(pages);
      const r = http.get(`${BASE_URL}${page.path}`, { tags: { name: page.name } });
      dashSuccess.add(r.status === 200);
      http.get(`${BASE_URL}${pick(apis)}`, { tags: { name: "api_companion" } });
      sleep(rand(4, 9));
    }

    if (vuProjectId) {
      http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "project_boq" } });
      sleep(rand(3, 6));
    }
  });
}

// ─── LANDING PAGE VISITOR (15%) — no login ───────────────────────────────────
// Simulates: prospects browsing the public site before signing up
function runLanding() {
  group("Landing", () => {
    const r1 = http.get(`${BASE_URL}/`, { tags: { name: "homepage" } });
    landingSuccess.add(r1.status === 200);
    sleep(rand(5, 12)); // reads homepage content

    // Visits a second page (login or register)
    const next = pick(["/login", "/register"]);
    const r2 = http.get(`${BASE_URL}${next}`, { tags: { name: "landing_nav" } });
    landingSuccess.add(r2.status === 200 || r2.status === 308); // 308 if redirect
    sleep(rand(8, 20)); // thinks about signing up
  });
}

// ─── LOGIN WAVE (10%) ─────────────────────────────────────────────────────────
// Simulates: new users logging in during a busy period (e.g. morning rush, demo class)
// Intentionally re-logins every iteration — tests auth endpoint under sustained load.
function runLogin() {
  group("Login", () => {
    const ok = doLogin(__VU - 1);
    if (ok) {
      check(
        http.get(`${BASE_URL}/dashboard`, { tags: { name: "post_login_dashboard" } }),
        { "dashboard loads after login": r => r.status === 200 }
      );
      http.get(`${BASE_URL}/api/notifications`, { tags: { name: "post_login_notif" } });
      sleep(rand(20, 45)); // stays active, then "logs out" and next iteration re-logins
    } else {
      sleep(rand(15, 30));
    }
  });
}

// ─── DRAWING VIEWER (10%) ────────────────────────────────────────────────────
// Simulates: user uploading a PDF floor plan and browsing the drawings tab
function runDrawing() {
  if (!ensureReady()) { sleep(rand(10, 20)); return; }
  if (!vuProjectId)    { sleep(10); return; }

  group("Drawing", () => {
    const r1 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/drawings`, { tags: { name: "drawings_list" } });
    drawingSuccess.add(r1.status === 200 || r1.status === 404);
    sleep(rand(3, 7));

    // Simulate clicking "Upload Drawing" → requests a presigned upload URL
    const r2 = http.post(
      `${BASE_URL}/api/projects/${vuProjectId}/drawings/upload-url`,
      JSON.stringify({ fileName: "floor-plan.pdf", fileSize: 2048000 }),
      { headers: { "Content-Type": "application/json" }, tags: { name: "upload_url" } }
    );
    drawingSuccess.add(r2.status === 200 || r2.status === 201 || r2.status === 404);
    sleep(rand(8, 18)); // waits while file uploads to S3 (the actual S3 PUT is not tested here)

    // Refresh list after upload
    const r3 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/drawings`, { tags: { name: "drawings_refresh" } });
    drawingSuccess.add(r3.status === 200 || r3.status === 404);
    sleep(rand(5, 10));
  });
}

// ─── EXPORTER (5%) ───────────────────────────────────────────────────────────
// Simulates: user exporting BOQ to PDF or Excel (server-side render, CPU-heavy)
// Sleep times are long — real users don't export continuously.
function runExport() {
  if (!ensureReady()) { sleep(rand(15, 30)); return; }
  if (!vuProjectId)    { sleep(15); return; }

  group("Export", () => {
    // View BOQ before exporting (what the app does)
    http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "pre_export_boq" } });
    sleep(rand(5, 10));

    const format = pick(["pdf", "excel", "procurement"]);
    const t = Date.now();
    const res = http.get(
      `${BASE_URL}/api/projects/${vuProjectId}/boq/export/${format}`,
      { tags: { name: `export_${format}` }, timeout: "30s" }
    );
    exportMs.add(Date.now() - t);
    exportSuccess.add(res.status === 200 || res.status === 404);
    check(res, { "export completed": r => r.status === 200 || r.status === 404 });

    sleep(rand(40, 90)); // exports are rare — user works for a while before next export
  });
}
