/**
 * Realistic Mixed Load Test — estimatenepal.com
 *
 * Simulates real user behavior across 5 simultaneous groups:
 *
 *   Group A — "New Logins"         : users logging in from scratch
 *   Group B — "Dashboard Workers"  : authenticated users browsing projects
 *   Group C — "Takeoff Workers"    : authenticated users hitting takeoff APIs
 *   Group D — "Exporters"          : authenticated users triggering exports
 *   Group E — "Landing Page"       : unauthenticated visitors browsing public pages
 *
 * Usage:
 *   # Install k6: https://k6.io/docs/getting-started/installation/
 *
 *   # Run locally (single IP):
 *   k6 run load-tests/k6-mixed-realistic.js
 *
 *   # Run on k6 Cloud (multi-IP, free tier):
 *   k6 cloud load-tests/k6-mixed-realistic.js
 *
 *   # Override VU counts:
 *   k6 run --env LOGINS=20 --env WORKERS=30 --env TAKEOFF=10 load-tests/k6-mixed-realistic.js
 *
 * Requires: scripts/load-test-users.json (run seed-demo-users.js first)
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ───────────────────────────────────────────────────────────
const loginSuccessRate  = new Rate("login_success_rate");
const loginDuration     = new Trend("login_duration_ms");
const dashboardDuration = new Trend("dashboard_duration_ms");
const takeoffDuration   = new Trend("takeoff_api_duration_ms");
const exportDuration    = new Trend("export_duration_ms");

// ─── User pool ────────────────────────────────────────────────────────────────
const users = new SharedArray("users", function () {
  return JSON.parse(open("../scripts/load-test-users.json"));
});

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL    = "https://estimatenepal.com";
const VU_LOGINS   = parseInt(__ENV.LOGINS  || "10");
const VU_WORKERS  = parseInt(__ENV.WORKERS || "20");
const VU_TAKEOFF  = parseInt(__ENV.TAKEOFF || "10");
const VU_EXPORT   = parseInt(__ENV.EXPORT  || "5");
const VU_LANDING  = parseInt(__ENV.LANDING || "10");
const DURATION    = __ENV.DURATION || "3m";

export const options = {
  scenarios: {
    // Group A: Continuous new logins (most critical to test)
    new_logins: {
      executor: "constant-vus",
      vus: VU_LOGINS,
      duration: DURATION,
      exec: "loginFlow",
      tags: { group: "login" },
    },
    // Group B: Already logged-in users browsing dashboard
    dashboard_workers: {
      executor: "constant-vus",
      vus: VU_WORKERS,
      duration: DURATION,
      exec: "dashboardWork",
      tags: { group: "dashboard" },
    },
    // Group C: Users actively using takeoff (main engagement feature)
    takeoff_workers: {
      executor: "constant-vus",
      vus: VU_TAKEOFF,
      duration: DURATION,
      exec: "takeoffWork",
      tags: { group: "takeoff" },
    },
    // Group D: Users exporting PDFs / Excel (CPU-heavy)
    exporters: {
      executor: "constant-vus",
      vus: VU_EXPORT,
      duration: DURATION,
      exec: "exportWork",
      tags: { group: "export" },
    },
    // Group E: Public visitors on landing page
    landing_visitors: {
      executor: "constant-vus",
      vus: VU_LANDING,
      duration: DURATION,
      exec: "landingPage",
      tags: { group: "landing" },
    },
  },
  thresholds: {
    // Overall health thresholds
    http_req_failed:         ["rate<0.05"],   // <5% total errors
    http_req_duration:       ["p(95)<5000"],  // 95% of requests under 5s
    login_success_rate:      ["rate>0.90"],   // >90% logins succeed
    login_duration_ms:       ["p(95)<8000"],  // 95% logins complete in 8s
    dashboard_duration_ms:   ["p(95)<3000"],  // dashboard pages under 3s
    takeoff_api_duration_ms: ["p(95)<4000"],  // takeoff APIs under 4s
    export_duration_ms:      ["p(95)<15000"], // exports can be slow (15s max)
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pickUser() {
  // Each VU gets a consistent user based on its index
  return users[(__VU - 1) % users.length];
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Login via NextAuth credentials provider.
 * Returns the session cookie jar (http module handles this automatically).
 */
function doLogin(email, password) {
  const start = Date.now();

  // Step 1: Get CSRF token
  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, {
    tags: { name: "auth_csrf" },
  });

  if (csrfRes.status !== 200) return false;

  let csrfToken;
  try {
    csrfToken = JSON.parse(csrfRes.body).csrfToken;
  } catch {
    return false;
  }

  if (!csrfToken) return false;

  // Step 2: Submit credentials
  const loginRes = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&redirect=false&json=true&callbackUrl=${encodeURIComponent(BASE_URL + "/dashboard")}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirects: 5,
      tags: { name: "auth_login" },
    }
  );

  const elapsed = Date.now() - start;
  loginDuration.add(elapsed);

  // NextAuth returns 200 with a URL field on success, or an error field
  const success =
    loginRes.status === 200 &&
    loginRes.body &&
    !loginRes.body.includes('"error"');

  loginSuccessRate.add(success);
  return success;
}

// ─── Group A: Login flow ──────────────────────────────────────────────────────
export function loginFlow() {
  const user = pickUser();

  group("Login Flow", function () {
    const ok = doLogin(user.email, user.password);

    check(null, {
      "login succeeded": () => ok,
    });

    if (ok) {
      // After login, land on dashboard briefly
      const dashRes = http.get(`${BASE_URL}/dashboard`, {
        tags: { name: "post_login_dashboard" },
      });
      check(dashRes, { "dashboard loads after login": (r) => r.status === 200 });
    }
  });

  // Real users don't retry immediately — wait before next login attempt
  sleep(randomBetween(10, 20));
}

// ─── Group B: Dashboard work ──────────────────────────────────────────────────
export function dashboardWork() {
  const user = pickUser();

  // Login once at the start of the VU lifetime
  if (!doLogin(user.email, user.password)) {
    sleep(5);
    return;
  }

  // Simulate a working session — browse multiple pages with human-like pauses
  const dashboardPages = [
    { path: "/dashboard",              name: "dashboard_home" },
    { path: "/dashboard/projects",     name: "projects_list" },
    { path: "/dashboard/rates",        name: "rates_page" },
    { path: "/dashboard/bid-board",    name: "bid_board" },
    { path: "/dashboard/assemblies",   name: "assemblies" },
    { path: "/dashboard/settings",     name: "settings" },
  ];

  const apiCalls = [
    "/api/notifications",
    "/api/orgs/me",
    "/api/projects",
  ];

  group("Dashboard Session", function () {
    // Visit 5-8 random pages in a session
    const pageCount = Math.floor(randomBetween(5, 9));
    for (let i = 0; i < pageCount; i++) {
      const page = randomItem(dashboardPages);
      const start = Date.now();

      const res = http.get(`${BASE_URL}${page.path}`, {
        tags: { name: page.name },
      });

      dashboardDuration.add(Date.now() - start);
      check(res, { [`${page.name} ok`]: (r) => r.status === 200 });

      // Fetch companion API data (like the browser does)
      const api = randomItem(apiCalls);
      http.get(`${BASE_URL}${api}`, { tags: { name: "api_companion" } });

      // Human reading/thinking time between pages
      sleep(randomBetween(3, 8));
    }
  });
}

// ─── Group C: Takeoff work (API simulation) ───────────────────────────────────
export function takeoffWork() {
  const user = pickUser();

  if (!doLogin(user.email, user.password)) {
    sleep(5);
    return;
  }

  group("Takeoff Work", function () {
    // Load project list
    const projectsRes = http.get(`${BASE_URL}/api/projects`, {
      tags: { name: "takeoff_project_list" },
    });

    let projectId = null;
    try {
      const projects = JSON.parse(projectsRes.body);
      if (projects && projects.length > 0) {
        projectId = projects[0].id;
      }
    } catch {
      // no projects for this user
    }

    if (!projectId) {
      sleep(5);
      return;
    }

    // Simulate takeoff session on a project
    const takeoffEndpoints = [
      `/api/projects/${projectId}/disciplines`,
      `/api/projects/${projectId}/takeoff-groups`,
      `/api/projects/${projectId}/boq`,
      `/api/projects/${projectId}/drawings`,
      `/api/projects/${projectId}/members`,
    ];

    for (const endpoint of takeoffEndpoints) {
      const start = Date.now();
      const res = http.get(`${BASE_URL}${endpoint}`, {
        tags: { name: "takeoff_api" },
      });
      takeoffDuration.add(Date.now() - start);
      check(res, { "takeoff api ok": (r) => r.status === 200 || r.status === 404 });
      sleep(randomBetween(2, 5));
    }
  });
}

// ─── Group D: Export work ─────────────────────────────────────────────────────
export function exportWork() {
  const user = pickUser();

  if (!doLogin(user.email, user.password)) {
    sleep(5);
    return;
  }

  group("Export Work", function () {
    const projectsRes = http.get(`${BASE_URL}/api/projects`, {
      tags: { name: "export_project_list" },
    });

    let projectId = null;
    try {
      const projects = JSON.parse(projectsRes.body);
      if (projects && projects.length > 0) {
        projectId = randomItem(projects).id;
      }
    } catch {}

    if (!projectId) {
      sleep(10);
      return;
    }

    // Hit BOQ first (loads before export)
    http.get(`${BASE_URL}/api/projects/${projectId}/boq`, {
      tags: { name: "pre_export_boq" },
    });
    sleep(2);

    // Trigger export (PDF is heaviest)
    const exportTypes = ["pdf", "excel", "procurement"];
    const exportType  = randomItem(exportTypes);
    const start       = Date.now();

    const exportRes = http.get(
      `${BASE_URL}/api/projects/${projectId}/boq/export/${exportType}`,
      { tags: { name: `export_${exportType}` }, timeout: "30s" }
    );

    exportDuration.add(Date.now() - start);
    check(exportRes, {
      "export triggered": (r) => r.status === 200 || r.status === 404,
    });

    // Users don't export continuously — long pause after
    sleep(randomBetween(15, 30));
  });
}

// ─── Group E: Landing page visitors ──────────────────────────────────────────
export function landingPage() {
  const publicPages = [
    { path: "/",          name: "homepage" },
    { path: "/about",     name: "about" },
    { path: "/faq",       name: "faq" },
    { path: "/contact",   name: "contact" },
    { path: "/login",     name: "login_page" },
    { path: "/register",  name: "register_page" },
  ];

  group("Landing Page Visit", function () {
    const page = randomItem(publicPages);
    const res  = http.get(`${BASE_URL}${page.path}`, {
      tags: { name: page.name },
    });
    check(res, { [`${page.name} loads`]: (r) => r.status === 200 });
    sleep(randomBetween(5, 15));
  });
}
