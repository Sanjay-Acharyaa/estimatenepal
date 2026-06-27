/**
 * Takeoff Capacity Test — estimatenepal.com
 * Grafana Cloud compatible (max 100 VUs)
 *
 * PURPOSE:
 *   Find exactly how many simultaneous takeoff workers the server can handle.
 *   Takeoff is the primary feature — this test answers the core question:
 *   "How many people can draw lines and measure quantities at the same time?"
 *
 * USER MIX (realistic — other user types always present in background):
 *   85% — Takeoff workers     draw lines, measure quantities, view BOQ
 *   10% — Dashboard explorers browse in background (always someone on dashboard)
 *    5% — Exporters           someone always exporting while others work
 *
 *   At 100 VUs: 85 takeoff + 10 dashboard + 5 export
 *   (Login wave removed — it re-logins every 30s and burns the IP rate limit)
 *
 * ESCALATION:
 *   25 VUs  →  20 takeoff  — baseline
 *   50 VUs  →  40 takeoff  — moderate
 *   75 VUs  →  60 takeoff  — busy session
 *  100 VUs  →  80 takeoff  — stress (hold 8 min to confirm stability)
 *
 * HOW TO READ THE RESULT:
 *   — All stages pass                → server handles 80 simultaneous takeoff users
 *   — Test aborts at X VUs          → ceiling is X×0.8 takeoff workers
 *   — P95 starts climbing at X VUs  → (X×0.8) - 20 is your safe takeoff capacity
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ───────────────────────────────────────────────────────────
const takeoffSuccess = new Rate("takeoff_success");
const dashSuccess    = new Rate("dashboard_success");
const exportSuccess  = new Rate("export_success");

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

// ─── Per-VU state ─────────────────────────────────────────────────────────────
let vuPersona      = null;
let vuReady        = false;
let vuProjectId    = null;
let vuLoginTries   = 0;    // number of login attempts made by this VU
const MAX_LOGIN_TRIES = 3; // give up after 3 failures — don't flood auth endpoint

// ─── Test config ──────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    takeoff_stress: {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 25  }, // ramp up
        { duration: "4m", target: 25  }, // HOLD — 20 takeoff workers (baseline)
        { duration: "2m", target: 50  }, // ramp up
        { duration: "4m", target: 50  }, // HOLD — 40 takeoff workers
        { duration: "2m", target: 75  }, // ramp up
        { duration: "4m", target: 75  }, // HOLD — 60 takeoff workers
        { duration: "2m", target: 100 }, // ramp up
        { duration: "8m", target: 100 }, // HOLD — 80 takeoff workers (stress)
        { duration: "1m", target: 0   }, // cool down
      ],
    },
  },

  thresholds: {
    // Auto-abort when wall is hit
    http_req_duration: [{ threshold: "p(95)<8000", abortOnFail: true }],
    http_req_failed:   [{ threshold: "rate<0.15",  abortOnFail: true }],

    // Takeoff-specific — the number that matters most
    takeoff_success: ["rate>0.90"],  // stricter than mixed test — it's the main feature
    takeoff_ms:      ["p(95)<5000"],

    // Background health
    dashboard_success: ["rate>0.85"],
    export_success:    ["rate>0.70"],
    export_ms:         ["p(95)<20000"],
  },
};

// ─── Persona assignment ───────────────────────────────────────────────────────
function assignPersona() {
  const roll = __VU % 20;
  if (roll <= 16) return "takeoff";   // 85%  (rolls 0–16)
  if (roll <= 18) return "dashboard"; // 10%  (rolls 17–18)
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

  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(user.password)}&redirect=false&json=true`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirects: 5,
      tags: { name: "login" },
    }
  );

  return res.status === 200 && res.body && !res.body.includes('"error"');
}

function fetchProjectId() {
  const res = http.get(`${BASE_URL}/api/projects`, { tags: { name: "project_list" } });
  try {
    const data = JSON.parse(res.body);
    if (Array.isArray(data) && data.length > 0) return data[0].id;
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

function ensureReady() {
  if (vuReady) return true;
  if (vuLoginTries >= MAX_LOGIN_TRIES) return false; // gave up — stop retrying

  vuLoginTries++;
  const ok = doLogin(__VU - 1);
  if (!ok) return false;

  vuReady     = true;
  vuProjectId = fetchProjectId();
  if (!vuProjectId) vuProjectId = createProject();
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function () {
  if (!vuPersona) vuPersona = assignPersona();

  switch (vuPersona) {
    case "takeoff":   runTakeoff();   break;
    case "dashboard": runDashboard(); break;
    case "export":    runExport();    break;
  }
}

// ─── TAKEOFF WORKER (80%) ─────────────────────────────────────────────────────
// Full realistic takeoff session: load workspace → view drawing → draw
// measurement → check BOQ quantities → repeat
function runTakeoff() {
  if (!ensureReady()) {
    // If given up on login: sleep 3–5 min (idle, not retrying).
    // If still within retry budget: sleep 30–60s before next attempt.
    sleep(vuLoginTries >= MAX_LOGIN_TRIES ? rand(180, 300) : rand(30, 60));
    return;
  }
  if (!vuProjectId) { sleep(rand(10, 20)); return; }

  group("Takeoff", () => {
    // 1. Open the project workspace
    const t = Date.now();
    const r1 = http.get(`${BASE_URL}/api/projects/${vuProjectId}`, { tags: { name: "project_detail" } });
    takeoffSuccess.add(r1.status === 200 || r1.status === 404);

    // 2. Load disciplines (the tabs on the drawing canvas)
    const r2 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/disciplines`, { tags: { name: "disciplines" } });
    takeoffSuccess.add(r2.status === 200 || r2.status === 404);
    takeoffMs.add(Date.now() - t);
    sleep(rand(2, 4)); // user picks a discipline to work on

    // 3. Load existing measurements on the canvas
    const r3 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/takeoff-groups`, { tags: { name: "takeoff_groups" } });
    takeoffSuccess.add(r3.status === 200 || r3.status === 404);

    // 4. Load the PDF drawing list (user selects which drawing to measure)
    const r4 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/drawings`, { tags: { name: "drawings_list" } });
    takeoffSuccess.add(r4.status === 200 || r4.status === 404);
    sleep(rand(3, 7)); // user studies the drawing before measuring

    // 5. Draw a measurement (the core action: line, area, or count)
    const measureTypes = ["LINEAR", "AREA", "COUNT"];
    const colours      = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
    const r5 = http.post(
      `${BASE_URL}/api/projects/${vuProjectId}/takeoff-groups`,
      JSON.stringify({
        name:   `Group ${Date.now()}`,
        type:   pick(measureTypes),
        colour: pick(colours),
      }),
      { headers: { "Content-Type": "application/json" }, tags: { name: "draw_measurement" } }
    );
    takeoffSuccess.add(r5.status === 200 || r5.status === 201);
    sleep(rand(4, 9)); // time spent actually drawing on the canvas

    // 6. BOQ auto-updates after every measurement — user checks quantities
    const r6 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "boq_refresh" } });
    takeoffSuccess.add(r6.status === 200 || r6.status === 404);
    sleep(rand(5, 12)); // user reads and verifies quantities before next measurement
  });
}

// ─── DASHBOARD EXPLORER (10%) — background load ───────────────────────────────
function runDashboard() {
  if (!ensureReady()) {
    sleep(vuLoginTries >= MAX_LOGIN_TRIES ? rand(180, 300) : rand(30, 60));
    return;
  }

  group("Dashboard", () => {
    const pages = [
      "/dashboard",
      "/dashboard/projects",
      "/dashboard/rates",
      "/dashboard/bid-board",
      "/dashboard/assemblies",
    ];
    const apis = ["/api/notifications", "/api/orgs/me", "/api/projects"];

    const r = http.get(`${BASE_URL}${pick(pages)}`, { tags: { name: "dashboard_page" } });
    dashSuccess.add(r.status === 200);
    http.get(`${BASE_URL}${pick(apis)}`, { tags: { name: "api_companion" } });
    sleep(rand(5, 12));

    if (vuProjectId) {
      http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "boq_view" } });
    }
    sleep(rand(4, 8));
  });
}

// ─── EXPORTER (5%) — background CPU load ─────────────────────────────────────
function runExport() {
  if (!ensureReady()) {
    sleep(vuLoginTries >= MAX_LOGIN_TRIES ? rand(180, 300) : rand(30, 60));
    return;
  }
  if (!vuProjectId) { sleep(15); return; }

  group("Export", () => {
    http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "pre_export_boq" } });
    sleep(rand(5, 10));

    const t      = Date.now();
    const format = pick(["pdf", "excel", "procurement"]);
    const res    = http.get(
      `${BASE_URL}/api/projects/${vuProjectId}/boq/export/${format}`,
      { tags: { name: `export_${format}` }, timeout: "30s" }
    );
    exportMs.add(Date.now() - t);
    exportSuccess.add(res.status === 200 || res.status === 404);
    sleep(rand(40, 90)); // exports are infrequent
  });
}
