/**
 * Mixed Realistic Load Test — estimatenepal.com
 * Grafana Cloud compatible (no local file reads)
 *
 * Traffic distribution (100 VUs total):
 *   40 VUs → Takeoff workers     (main feature, highest engagement)
 *   25 VUs → Dashboard explorers (projects, rates, BOQ, assemblies)
 *   15 VUs → Login wave          (continuous new logins — tests login throughput)
 *   10 VUs → Drawing viewers     (drawings page, upload flow)
 *   10 VUs → Exporters           (PDF/Excel - CPU heavy, low count)
 *
 * KEY DESIGN: each VU logs in ONCE on its first iteration and reuses the session
 * cookie for the entire test duration. This matches real user behaviour and avoids
 * triggering the IP-based rate limiter from Grafana Cloud's shared IP pool.
 *
 * How to run on Grafana Cloud:
 *   1. Open Grafana → Testing & synthetics → Performance → New test → Script Editor
 *   2. Paste this entire file (Ctrl+A, Delete, then paste)
 *   3. Click "Create and run"
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics per scenario ─────────────────────────────────────────────
const loginSuccess    = new Rate("login_success");
const takeoffSuccess  = new Rate("takeoff_success");
const exportSuccess   = new Rate("export_success");
const dashSuccess     = new Rate("dashboard_success");
const drawingSuccess  = new Rate("drawing_success");

const loginDuration   = new Trend("login_ms");
const takeoffDuration = new Trend("takeoff_ms");
const exportDuration  = new Trend("export_ms");

// ─── Inline users (200 available, matches seeded accounts) ───────────────────
const DOMAIN   = "loadtest.estimatenepal.local";
const PASSWORD = "Demo@123456";
const users    = Array.from({ length: 200 }, (_, i) => ({
  email: `demo${String(i + 1).padStart(3, "0")}@${DOMAIN}`,
  password: PASSWORD,
}));

const BASE_URL = "https://estimatenepal.com";

// ─── Per-VU session state (module-level = persists across iterations per VU) ─
// Each VU gets its own copy. Login once, reuse for all iterations.
let vuReady     = false;   // true after first successful login
let vuProjectId = null;    // cached after first /api/projects call

// ─── Scenario config ──────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    takeoff_workers: {
      executor: "constant-vus",
      vus: 40,
      duration: "15m",
      exec: "takeoffWork",
      startTime: "30s",
    },
    dashboard_explorers: {
      executor: "constant-vus",
      vus: 25,
      duration: "15m",
      exec: "dashboardWork",
      startTime: "20s",
    },
    login_wave: {
      executor: "constant-vus",
      vus: 15,
      duration: "16m",
      exec: "loginFlow",
      startTime: "0s",
    },
    drawing_viewers: {
      executor: "constant-vus",
      vus: 10,
      duration: "14m",
      exec: "drawingWork",
      startTime: "1m",
    },
    exporters: {
      executor: "constant-vus",
      vus: 10,
      duration: "13m",
      exec: "exportWork",
      startTime: "2m",
    },
  },
  thresholds: {
    http_req_failed:   ["rate<0.15"],
    http_req_duration: ["p(95)<8000"],
    login_success:     ["rate>0.80"],
    takeoff_success:   ["rate>0.85"],
    dashboard_success: ["rate>0.85"],
    drawing_success:   ["rate>0.80"],
    export_success:    ["rate>0.70"],
    export_ms:         ["p(95)<20000"],
  },
};

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

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(user.password)}&redirect=false&json=true`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirects: 5,
      tags: { name: "login" },
    }
  );
  loginDuration.add(Date.now() - start);

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

// Ensures this VU is logged in and has a project ID before doing any work.
// Safe to call at the start of every iteration — only does real work once.
function ensureReady(vuIndex) {
  if (vuReady) return true;

  const ok = doLogin(vuIndex);
  if (!ok) return false;

  vuReady = true;
  vuProjectId = fetchProjectId();
  return true;
}

// ─── Scenario A: Takeoff workers (40 VUs) ────────────────────────────────────
export function takeoffWork() {
  if (!ensureReady(__VU - 1)) { sleep(rand(10, 20)); return; }

  group("Takeoff Session", () => {
    const endpoints = [
      { url: `/api/projects/${vuProjectId}`,                name: "project_detail"    },
      { url: `/api/projects/${vuProjectId}/disciplines`,    name: "disciplines"       },
      { url: `/api/projects/${vuProjectId}/takeoff-groups`, name: "takeoff_groups"    },
      { url: `/api/projects/${vuProjectId}/boq`,            name: "boq_load"          },
      { url: `/api/projects/${vuProjectId}/drawings`,       name: "drawings_list"     },
    ];

    for (const ep of endpoints) {
      const start = Date.now();
      const r = http.get(`${BASE_URL}${ep.url}`, { tags: { name: ep.name } });
      takeoffDuration.add(Date.now() - start);
      takeoffSuccess.add(r.status === 200 || r.status === 404);
      sleep(rand(2, 5));
    }

    // Simulate creating a takeoff measurement
    if (vuProjectId) {
      const r = http.post(
        `${BASE_URL}/api/projects/${vuProjectId}/takeoff-groups`,
        JSON.stringify({ name: `LT Group ${Date.now()}`, type: "LINEAR", colour: "#3B82F6" }),
        { headers: { "Content-Type": "application/json" }, tags: { name: "create_takeoff_group" } }
      );
      takeoffSuccess.add(r.status === 200 || r.status === 201);
      sleep(rand(2, 4));
    }

    // Reload BOQ after adding (what the app does automatically)
    http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "boq_refresh" } });
    sleep(rand(5, 12));
  });
}

// ─── Scenario B: Dashboard explorers (25 VUs) ────────────────────────────────
export function dashboardWork() {
  if (!ensureReady(__VU - 1 + 40)) { sleep(rand(10, 20)); return; }

  group("Dashboard Session", () => {
    const pages = [
      { path: "/dashboard",            name: "dashboard_home"  },
      { path: "/dashboard/projects",   name: "projects_list"   },
      { path: "/dashboard/rates",      name: "rates_catalogue" },
      { path: "/dashboard/bid-board",  name: "bid_board"       },
      { path: "/dashboard/assemblies", name: "assemblies"      },
      { path: "/dashboard/settings",   name: "settings"        },
    ];
    const apis = ["/api/notifications", "/api/orgs/me", "/api/projects"];

    const count = Math.floor(rand(4, 7));
    for (let i = 0; i < count; i++) {
      const page = pick(pages);
      const r = http.get(`${BASE_URL}${page.path}`, { tags: { name: page.name } });
      dashSuccess.add(r.status === 200);
      http.get(`${BASE_URL}${pick(apis)}`, { tags: { name: "api_companion" } });
      sleep(rand(3, 8));
    }

    if (vuProjectId) {
      const r = http.get(`${BASE_URL}/dashboard/projects/${vuProjectId}`, { tags: { name: "project_detail_page" } });
      dashSuccess.add(r.status === 200);
      http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "boq_dashboard" } });
      sleep(rand(3, 6));
    }
  });
}

// ─── Scenario C: Login wave (15 VUs) — tests login throughput ────────────────
// These VUs DO re-login each iteration intentionally — they represent the
// "people logging in" part of the traffic (e.g. students joining a demo class).
export function loginFlow() {
  group("Login Flow", () => {
    const ok = doLogin(__VU - 1 + 65);
    if (ok) {
      const r = http.get(`${BASE_URL}/dashboard`, { tags: { name: "post_login_dashboard" } });
      check(r, { "dashboard after login": r => r.status === 200 });
      http.get(`${BASE_URL}/api/notifications`, { tags: { name: "post_login_notifications" } });
      sleep(rand(20, 40)); // stay logged in for a while before cycling
    } else {
      sleep(rand(15, 30));
    }
  });
}

// ─── Scenario D: Drawing viewers (10 VUs) ────────────────────────────────────
export function drawingWork() {
  if (!ensureReady(__VU - 1 + 80)) { sleep(rand(10, 20)); return; }
  if (!vuProjectId) { sleep(10); return; }

  group("Drawing Session", () => {
    const r1 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/drawings`, { tags: { name: "drawings_list" } });
    drawingSuccess.add(r1.status === 200);
    sleep(rand(3, 6));

    const uploadRes = http.post(
      `${BASE_URL}/api/projects/${vuProjectId}/drawings/upload-url`,
      JSON.stringify({ fileName: "floor-plan.pdf", fileSize: 2048000 }),
      { headers: { "Content-Type": "application/json" }, tags: { name: "upload_url_request" } }
    );
    drawingSuccess.add(uploadRes.status === 200 || uploadRes.status === 201);
    sleep(rand(5, 12));

    const r2 = http.get(`${BASE_URL}/api/projects/${vuProjectId}/drawings`, { tags: { name: "drawings_refresh" } });
    drawingSuccess.add(r2.status === 200);
    sleep(rand(5, 10));
  });
}

// ─── Scenario E: Exporters (10 VUs) ──────────────────────────────────────────
export function exportWork() {
  if (!ensureReady(__VU - 1 + 90)) { sleep(rand(15, 30)); return; }
  if (!vuProjectId) { sleep(15); return; }

  group("Export Session", () => {
    http.get(`${BASE_URL}/api/projects/${vuProjectId}/boq`, { tags: { name: "pre_export_boq" } });
    sleep(rand(5, 10));

    const exportType = pick(["pdf", "excel", "procurement"]);
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/projects/${vuProjectId}/boq/export/${exportType}`,
      { tags: { name: `export_${exportType}` }, timeout: "30s" }
    );
    exportDuration.add(Date.now() - start);
    exportSuccess.add(res.status === 200 || res.status === 404);
    check(res, { "export completed": r => r.status === 200 || r.status === 404 });

    sleep(rand(30, 60)); // realistic — users don't export continuously
  });
}
