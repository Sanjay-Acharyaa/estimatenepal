# Load Testing Guide — estimatenepal.com

## Step 1: Create 200 demo accounts (run on server)

```bash
cd /var/www/nepaliestimate
node scripts/seed-demo-users.js
```

This creates:
- 4 large firms (20 users each)
- 15 medium firms (4 users each)
- 60 solo users
- All with password: Demo@123456
- Outputs: scripts/load-test-users.json

## Step 2: Copy credentials to your PC

```bash
# Run this on your Windows PC
scp root@YOUR_SERVER_IP:/var/www/nepaliestimate/scripts/load-test-users.json ./scripts/
```

## Step 3: Install k6 on Windows

Download from: https://github.com/grafana/k6/releases
Or: winget install k6

## Step 4: Run the tests

### Test A — Mixed realistic (Grafana Cloud, 100 VUs, recommended)
Upload `load-tests/k6-mixed-cloud.js` to Grafana Cloud Script Editor.
Simulates real traffic:
- 40 VUs doing takeoff (main feature — BOQ, disciplines, takeoff groups)
- 25 VUs exploring dashboard (rates, projects, assemblies)
- 15 VUs logging in continuously
- 10 VUs on the drawings/upload page
- 10 VUs exporting PDF/Excel

### Test B — Escalating load (local run, finds breaking point)
```bash
k6 run load-tests/k6-cloud.js
```

### Test C — Escalating with file (requires load-test-users.json)
```bash
k6 run load-tests/k6-escalating.js
```

## Step 5: Cleanup after testing

```bash
cd /var/www/nepaliestimate
node scripts/seed-demo-users.js --cleanup
```

## What each test tells you

| Test | What you learn |
|------|---------------|
| Mixed at 50 users | Can 50 simultaneous users (demo class) use the app? |
| Escalating 10→200 | Exact user count where the server breaks |
| High TAKEOFF count | How many users doing takeoff before slowdown |
| High EXPORT count | How many simultaneous exports before failure |
| Multi-IP cloud run | Real-world simulation from different locations |

## Key metrics to watch

- `login_success_rate` — must stay above 90%
- `login_duration_ms p(95)` — login under 8 seconds for 95% of users
- `dashboard_duration_ms p(95)` — dashboard under 3 seconds
- `http_req_failed` — total error rate must stay under 5%
