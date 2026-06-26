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

### Test A — Mixed realistic load (10 logins + 20 working + 10 takeoff + 5 export + 10 landing)
```bash
k6 run load-tests/k6-mixed-realistic.js
```

### Test B — Escalating load (finds exact breaking point with real user behavior)
```bash
k6 run load-tests/k6-escalating.js
```

### Test C — Custom VU counts
```bash
k6 run --env LOGINS=30 --env WORKERS=50 --env TAKEOFF=20 --env EXPORT=10 load-tests/k6-mixed-realistic.js
```

### Test D — Multi-IP from cloud (requires free k6 Cloud account)
```bash
k6 cloud load-tests/k6-escalating.js
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
