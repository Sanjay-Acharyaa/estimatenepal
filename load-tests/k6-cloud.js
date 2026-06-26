/**
 * Grafana Cloud k6 — Escalating realistic load test
 * Users are embedded inline (no local file needed)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate  = new Rate("errors");
const loginRate  = new Rate("login_success");
const respTrend  = new Trend("response_ms");

// Generate 200 users inline (same as seed script created)
const DOMAIN   = "loadtest.estimatenepal.local";
const PASSWORD = "Demo@123456";
const users    = Array.from({ length: 200 }, (_, i) => ({
  email: `demo${String(i + 1).padStart(3, "0")}@${DOMAIN}`,
  password: PASSWORD,
}));

const BASE_URL = "https://estimatenepal.com";

export const options = {
  stages: [
    { duration: "1m",  target: 10  }, // warm up
    { duration: "2m",  target: 10  }, // baseline
    { duration: "1m",  target: 30  }, // ramp
    { duration: "2m",  target: 30  }, // hold
    { duration: "1m",  target: 50  }, // demo class size
    { duration: "2m",  target: 50  }, // hold — key test
    { duration: "1m",  target: 80  },
    { duration: "2m",  target: 80  },
    { duration: "1m",  target: 100 },
    { duration: "2m",  target: 100 },
    { duration: "1m",  target: 0   }, // ramp down
  ],
  thresholds: {
    errors:            ["rate<0.10"],
    http_req_duration: ["p(95)<10000"],
    login_success:     ["rate>0.80"],
  },
};

function doLogin(email, password) {
  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`);
  if (csrfRes.status !== 200) return false;

  let csrfToken;
  try { csrfToken = JSON.parse(csrfRes.body).csrfToken; } catch { return false; }
  if (!csrfToken) return false;

  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&redirect=false&json=true`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, redirects: 5 }
  );

  const ok = res.status === 200 && res.body && !res.body.includes('"error"');
  loginRate.add(ok);
  errorRate.add(!ok);
  return ok;
}

export default function () {
  const user = users[(__VU - 1) % users.length];

  // Login
  const loggedIn = doLogin(user.email, user.password);
  if (!loggedIn) { sleep(5); return; }

  // Realistic session — visit random pages
  const pages = [
    "/dashboard",
    "/dashboard/projects",
    "/dashboard/rates",
    "/dashboard/bid-board",
    "/dashboard/assemblies",
  ];
  const apis = [
    "/api/notifications",
    "/api/orgs/me",
    "/api/projects",
  ];

  const count = Math.floor(Math.random() * 3) + 3; // 3-5 pages
  for (let i = 0; i < count; i++) {
    const page = pages[Math.floor(Math.random() * pages.length)];
    const start = Date.now();
    const r = http.get(`${BASE_URL}${page}`);
    respTrend.add(Date.now() - start);
    check(r, { "page ok": (r) => r.status === 200 });
    errorRate.add(r.status >= 400);

    // companion API call
    const api = apis[Math.floor(Math.random() * apis.length)];
    http.get(`${BASE_URL}${api}`);

    sleep(Math.random() * 5 + 2); // 2-7 second human pause
  }
}
