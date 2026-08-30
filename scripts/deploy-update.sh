#!/bin/bash
# Run this every time you want to deploy a new version.
# Usage: bash /var/www/nepaliestimate/scripts/deploy-update.sh
set -e

cd /var/www/nepaliestimate

echo "=== [1/5] Pulling latest code ==="
git pull origin main

echo "=== [2/5] Installing dependencies ==="
PUPPETEER_SKIP_DOWNLOAD=true npm ci --legacy-peer-deps

echo "=== [3/5] Generating Prisma client ==="
npx prisma generate

echo "=== [4/5] Building (stopping PM2 first to free RAM) ==="
pm2 stop all || true
NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "=== [5/5] Starting PM2 ==="
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=== Deploy complete ==="
pm2 status
