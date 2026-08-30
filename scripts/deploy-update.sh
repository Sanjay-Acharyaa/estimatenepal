#!/bin/bash
# Run this every time you want to deploy a new version.
# Usage: bash /var/www/estimatenepal/scripts/deploy-update.sh
set -e

cd /var/www/estimatenepal

echo "=== [1/4] Pulling latest code ==="
git pull origin main

echo "=== [2/4] Installing dependencies ==="
npm ci --legacy-peer-deps

echo "=== [3/4] Generating Prisma client & building ==="
npx prisma generate
npm run build

echo "=== [4/4] Reloading PM2 (zero-downtime) ==="
pm2 reload ecosystem.config.js --update-env

echo ""
echo "=== Deploy complete ==="
pm2 status
