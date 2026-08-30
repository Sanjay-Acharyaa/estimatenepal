#!/bin/bash
# First-time server setup. Run once on a fresh Droplet.
# Usage: bash deploy-setup.sh
set -e

echo "=== [1/7] Installing Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== [2/7] Installing PM2 ==="
sudo npm install -g pm2

echo "=== [3/7] Creating PM2 log directory ==="
sudo mkdir -p /var/log/pm2
sudo chown "$USER:$USER" /var/log/pm2

echo "=== [4/7] Cloning repo ==="
git clone https://github.com/Sanjay-Acharyaa/estimatenepal.git /var/www/estimatenepal
cd /var/www/estimatenepal

echo ""
echo ">>> STOP: Create your .env.local now before continuing."
echo "    Run:  nano /var/www/estimatenepal/.env.local"
echo "    Then press ENTER here to continue."
read -r

echo "=== [5/7] Installing dependencies & building ==="
npm ci --legacy-peer-deps
npx prisma generate
npm run build

echo "=== [6/7] Starting app with PM2 ==="
pm2 start ecosystem.config.js
pm2 save

echo "=== [7/7] Enabling PM2 on reboot ==="
pm2 startup | tail -1 | sudo bash

echo ""
echo "=== Setup complete. App running on port 3000. ==="
echo "    Next: set up Nginx + SSL with deploy-nginx.sh"
