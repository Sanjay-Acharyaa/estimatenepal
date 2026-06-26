/**
 * Escalating Load Test — finds the exact breaking point under real user behavior
 *
 * Starts with 10 users, adds 10 every 2 minutes until the server cracks.
 * All users do realistic mixed behavior (login → dashboard → work).
 *
 * Run:
 *   k6 run load-tests/k6-escalating.js
 *   k6 cloud load-tests/k6-escalating.js   ← multi-IP
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import { Rate, Trend } from "k6/metrics";

const errorRate     = new Rate("errors");
const loginRate     = new Rate("login_success");
const responseTrend = new Trend("response_time_ms");

const users = new SharedArray("users", function () {
  return JSON.parse(open("../scripts/load-test-users.json"));
});

const BASE_URL = "https://estimatenepal.com";

// Ramp from 10 → 200 users (finds breaking point)
export const options = {
  stages: [
    { duration: "1m",  target: 10  },  // warm up
    { duration: "2m",  target: 10  },  // baseline at 10 users
    { duration: "1m",  target: 30  },  // ramp to 30
    { duration: "2m",  target: 30  },  // hold at 30
    { duration: "1m",  target: 50  },  // ramp to 50 (demo class size)
    { duration: "2m",  target: 50  },  // hold at 50
    { duration: "1m",  target: 80  },  // ramp to 80
    { duration: "2m",  target: 80  },  // hold at 80
    { duration: "1m",  target: 120 },  // ramp to 120
    { duration: "2m",  target: 120 },  // hold at 120
    { duration: "1m",  target: 160 },  // ramp to 160
    { duration: "2m",  target: 160 },  // hold at 160
    { duration: "1m",  target: 200 },  // max — all 200 demo users
    { duration: "2m",  target: 200 },  // hold at 200
    { duration: "1m",  target: 0   },  // ramp down
  ],
  thresholds: {
    errors:           ["rate<0.10"],   // fail if >10% errors overall
    http_req_duration:["p(95)<10000"], // 95% of requests under 10s
  },
};

function pickUser() {
  return users[(__VU - 1) % users.length];
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function doLogin(email, password) {
  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`);
  if (csrfRes.status !== 200) return false;

  let csrfToken;
  try { csrfToken = JSON.parse(csrfRes.body).csrfToken; } catch { return false; }
  if (!csrfToken) return false;

  const loginRes = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&redirect=false&json=true`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirects: 5,
    }
  );

  const ok = loginRes.status === 200 && !loginRes.body.includes('"error"');
  loginRate.add(ok);
  errorRate.add(!ok);
  return ok;
}

export default function () {
  const user = pickUser();

  // 1. Login
  const loggedIn = doLogin(user.email, user.password);
  if (!loggedIn) {
    sleep(randomBetween(5, 10));
    return;
  }

  // 2. Simulate realistic session
  const actions = [
    () => {
      const start = Date.now();
      const r = http.get(`${BASE_URL}/dashboard`);
      responseTrend.add(Date.now() - start);
      check(r, { "dashboard ok": (r) => r.status === 200 });
      errorRate.add(r.status >= 400);
    },
    () => {
      const start = Date.now();
      const r = http.get(`${BASE_URL}/api/projects`);
      responseTrend.add(Date.now() - start);
      check(r, { "projects api ok": (r) => r.status === 200 });
      errorRate.add(r.status >= 400);
    },
    () => {
      const start = Date.now();
      const r = http.get(`${BASE_URL}/dashboard/projects`);
      responseTrend.add(Date.now() - start);
      check(r, { "projects page ok": (r) => r.status === 200 });
      errorRate.add(r.status >= 400);
    },
    () => {
      const start = Date.now();
      const r = http.get(`${BASE_URL}/api/notifications`);
      responseTrend.add(Date.now() - start);
      check(r, { "notifications ok": (r) => r.status === 200 });
      errorRate.add(r.status >= 400);
    },
    () => {
      const start = Date.now();
      const r = http.get(`${BASE_URL}/api/orgs/me`);
      responseTrend.add(Date.now() - start);
      check(r, { "org data ok": (r) => r.status === 200 });
      errorRate.add(r.status >= 400);
    },
    () => {
      const start = Date.now();
      const r = http.get(`${BASE_URL}/dashboard/rates`);
      responseTrend.add(Date.now() - start);
      check(r, { "rates page ok": (r) => r.status === 200 });
      errorRate.add(r.status >= 400);
    },
  ];

  // Do 3-5 random actions after login
  const count = Math.floor(randomBetween(3, 6));
  for (let i = 0; i < count; i++) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    action();
    sleep(randomBetween(2, 6)); // human pace
  }
}
