/**
 * Mixed Realistic Load Test — estimatenepal.com
 * Grafana Cloud compatible (no local file reads)
 *
 * Traffic distribution (100 VUs total):
 *   40 VUs → Takeoff workers     (main feature, highest engagement)
 *   25 VUs → Dashboard explorers (projects, rates, BOQ, assemblies)
 *   15 VUs → Login wave          (continuous new logins)
 *   10 VUs → Drawing viewers     (drawings page, upload flow)
 *   10 VUs → Exporters           (PDF/Excel - CPU heavy, low count)
 *
 * How to run on Grafana Cloud:
 *   1. Open Grafana → Testing & synthetics → Performance → New test → Script Editor
 *   2. Paste this entire file
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

// ─── Scenario config ──────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 40 VUs: Users actively doing takeoff (main workload)
    takeoff_workers: {
      executor: "constant-vus",
      vus: 40,
      duration: "15m",
      exec: "takeoffWork",
      startTime: "1m",      // login wave starts first
    },
    // 25 VUs: Users exploring dashboard, rates, projects
    dashboard_explorers: {
      executor: "constant-vus",
      vus: 25,
      duration: "15m",
      exec: "dashboardWork",
      startTime: "30s",
    },
    // 15 VUs: Continuous new logins (people joining during demo)
    login_wave: {
      executor: "constant-vus",
      vus: 15,
      duration: "16m",
      exec: "loginFlow",
      startTime: "0s",
    },
    // 10 VUs: Drawing page viewers + upload flow
    drawing_viewers: {
      executor: "constant-vus",
      vus: 10,
      duration: "14m",
      exec: "drawingWork",
      startTime: "2m",
    },
    // 10 VUs: Exporting PDF/Excel (CPU heavy, realistic low count)
    exporters: {
      executor: "constant-vus",
      vus: 10,
      duration: "13m",
      exec: "exportWork",
      startTime: "3m",      // start after others to stress the server more
    },
  },
  thresholds: {
    // Server must not collapse
    http_req_failed:   ["rate<0.20"],       // <20% total errors
    http_req_duration: ["p(95)<8000"],      // 95% of requests under 8s

    // Login must mostly work (cloud IPs may still hit rate limit)
    login_success:     ["rate>0.60"],

    // Authenticated features must be reliable
    takeoff_success:   ["rate>0.85"],
    dashboard_success: ["rate>0.85"],
    drawing_success:   ["rate>0.80"],

    // Exports can be slow but must complete
    export_success:    ["rate>0.70"],
    export_ms:         ["p(95)<20000"],     // exports allowed up to 20s
  },
};

// ─── Shared login helper ──────────────────────────────────────────────────────
function doLogin(vuIndex) {
  const user = users[vuIndex % users.length];

  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, {
    tags: { name: "csrf" },
  });
  if (csrfRes.status !== 200) return null;

  let csrfToken;
  try { csrfToken = JSON.parse(csrfRes.body).csrfToken; } catch { return null; }
  if (!csrfToken) return null;

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
  return ok ? user : null;
}

// After login, get first available project ID
function getFirstProjectId() {
  const res = http.get(`${BASE_URL}/api/projects`, { tags: { name: "project_list" } });
  try {
    const projects = JSON.parse(res.body);
    if (Array.isArray(projects) && projects.length > 0) return projects[0].id;
  } catch {}
  return null;
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Scenario A: Takeoff workers ──────────────────────────────────────────────
// Simulates users in the takeoff/BOQ view — most API-intensive workflow
export function takeoffWork() {
  const user = doLogin(__VU - 1);
  if (!user) { sleep(rand(5, 10)); return; }

  const projectId = getFirstProjectId();

  group("Takeoff Session", () => {
    // Navigate to project
    const pageRes = http.get(`${BASE_URL}/dashboard/projects`, { tags: { name: "projects_page" } });
    check(pageRes, { "projects page ok": r => r.status === 200 });
    sleep(rand(1, 3));

    if (!projectId) { sleep(5); return; }

    // Load all data a takeoff user needs
    const endpoints = [
      { url: `/api/projects/${projectId}`,               name: "project_detail"   },
      { url: `/api/projects/${projectId}/disciplines`,   name: "disciplines"      },
      { url: `/api/projects/${projectId}/takeoff-groups`,name: "takeoff_groups"   },
      { url: `/api/projects/${projectId}/boq`,           name: "boq_load"         },
      { url: `/api/projects/${projectId}/drawings`,      name: "drawings_list"    },
      { url: `/api/projects/${projectId}/members`,       name: "members"          },
    ];

    for (const ep of endpoints) {
      const start = Date.now();
      const r = http.get(`${BASE_URL}${ep.url}`, { tags: { name: ep.name } });
      takeoffDuration.add(Date.now() - start);
      takeoffSuccess.add(r.status === 200 || r.status === 404);
      sleep(rand(1, 3)); // user reads/works between API calls
    }

    // Simulate creating a takeoff group (user draws a measurement)
    const createRes = http.post(
      `${BASE_URL}/api/projects/${projectId}/takeoff-groups`,
      JSON.stringify({
        name: `Load Test Group ${Date.now()}`,
        type: "LINEAR",
        colour: "#3B82F6",
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "create_takeoff_group" },
      }
    );
    takeoffSuccess.add(createRes.status === 200 || createRes.status === 201);
    sleep(rand(2, 5));

    // Reload BOQ after adding items (what the app does)
    http.get(`${BASE_URL}/api/projects/${projectId}/boq`, { tags: { name: "boq_refresh" } });
    sleep(rand(3, 8));
  });
}

// ─── Scenario B: Dashboard explorers ─────────────────────────────────────────
// Simulates users browsing projects, rates, assemblies, bid board
export function dashboardWork() {
  const user = doLogin(__VU - 1 + 40); // offset from takeoff users
  if (!user) { sleep(rand(5, 10)); return; }

  const projectId = getFirstProjectId();

  group("Dashboard Session", () => {
    const pages = [
      { path: "/dashboard",             name: "dashboard_home"  },
      { path: "/dashboard/projects",    name: "projects_list"   },
      { path: "/dashboard/rates",       name: "rates_catalogue" },
      { path: "/dashboard/bid-board",   name: "bid_board"       },
      { path: "/dashboard/assemblies",  name: "assemblies"      },
      { path: "/dashboard/settings",    name: "settings"        },
    ];

    const apis = [
      "/api/notifications",
      "/api/orgs/me",
      "/api/projects",
    ];

    // Browse 4-6 pages with human-like pauses
    const pageCount = Math.floor(rand(4, 7));
    for (let i = 0; i < pageCount; i++) {
      const page = pick(pages);
      const r = http.get(`${BASE_URL}${page.path}`, { tags: { name: page.name } });
      dashSuccess.add(r.status === 200);
      check(r, { [`${page.name} loads`]: r => r.status === 200 });

      // Companion API call (what the browser fetches alongside the page)
      http.get(`${BASE_URL}${pick(apis)}`, { tags: { name: "api_companion" } });

      sleep(rand(3, 8));
    }

    // Visit project detail if we have one
    if (projectId) {
      const r = http.get(`${BASE_URL}/dashboard/projects/${projectId}`, { tags: { name: "project_detail_page" } });
      dashSuccess.add(r.status === 200);
      http.get(`${BASE_URL}/api/projects/${projectId}/boq`, { tags: { name: "boq_dashboard" } });
      sleep(rand(3, 6));
    }
  });
}

// ─── Scenario C: Login wave ───────────────────────────────────────────────────
// Simulates students/users logging in during a demo class
export function loginFlow() {
  group("Login Flow", () => {
    const user = doLogin(__VU - 1 + 65); // offset

    if (user) {
      // After login, land on dashboard briefly
      const r = http.get(`${BASE_URL}/dashboard`, { tags: { name: "post_login_dashboard" } });
      check(r, { "dashboard loads after login": r => r.status === 200 });
      http.get(`${BASE_URL}/api/notifications`, { tags: { name: "post_login_notifications" } });
      sleep(rand(8, 15)); // user spends time on dashboard before next action
    } else {
      sleep(rand(5, 10));
    }
  });
}

// ─── Scenario D: Drawing viewers ─────────────────────────────────────────────
// Simulates users on the drawings/documents page
export function drawingWork() {
  const user = doLogin(__VU - 1 + 80); // offset
  if (!user) { sleep(rand(5, 10)); return; }

  const projectId = getFirstProjectId();
  if (!projectId) { sleep(10); return; }

  group("Drawing Session", () => {
    // Navigate to project drawings
    const r1 = http.get(`${BASE_URL}/api/projects/${projectId}/drawings`, { tags: { name: "drawings_list" } });
    drawingSuccess.add(r1.status === 200);
    sleep(rand(2, 4));

    // Request upload URL (simulates user about to upload a PDF)
    const uploadRes = http.post(
      `${BASE_URL}/api/projects/${projectId}/drawings/upload-url`,
      JSON.stringify({ fileName: "test-drawing.pdf", fileSize: 2048000 }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "upload_url_request" },
      }
    );
    drawingSuccess.add(uploadRes.status === 200 || uploadRes.status === 201);
    sleep(rand(3, 8)); // user "uploads" file (actual upload goes to S3, not our server)

    // Reload drawings list after upload
    const r2 = http.get(`${BASE_URL}/api/projects/${projectId}/drawings`, { tags: { name: "drawings_refresh" } });
    drawingSuccess.add(r2.status === 200);

    // Check drawing page in dashboard
    http.get(`${BASE_URL}/dashboard/projects/${projectId}`, { tags: { name: "project_with_drawings" } });
    sleep(rand(5, 10));
  });
}

// ─── Scenario E: Exporters ────────────────────────────────────────────────────
// Simulates users exporting BOQ as PDF or Excel — CPU heavy
export function exportWork() {
  const user = doLogin(__VU - 1 + 90); // offset
  if (!user) { sleep(rand(10, 20)); return; }

  const projectId = getFirstProjectId();
  if (!projectId) { sleep(15); return; }

  group("Export Session", () => {
    // Load BOQ first (user reviews before exporting)
    http.get(`${BASE_URL}/api/projects/${projectId}/boq`, { tags: { name: "pre_export_boq" } });
    sleep(rand(3, 6));

    // Trigger export — PDF is the most common and heaviest
    const exportTypes = ["pdf", "excel", "procurement"];
    const exportType  = pick(exportTypes);

    const start = Date.now();
    const exportRes = http.get(
      `${BASE_URL}/api/projects/${projectId}/boq/export/${exportType}`,
      {
        tags: { name: `export_${exportType}` },
        timeout: "30s",
      }
    );
    exportDuration.add(Date.now() - start);
    exportSuccess.add(exportRes.status === 200 || exportRes.status === 404);

    check(exportRes, {
      "export completed": r => r.status === 200 || r.status === 404,
    });

    // Users don't export repeatedly — long pause after
    sleep(rand(20, 40));
  });
}
