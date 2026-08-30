#!/bin/bash
# Sets up Nginx reverse proxy + SSL for estimatenepal.com
# Usage: bash deploy-nginx.sh
set -e

DOMAIN="estimatenepal.com"

echo "=== [1/4] Installing Nginx & Certbot ==="
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "=== [2/4] Writing Nginx config ==="
sudo tee /etc/nginx/sites-available/estimatenepal > /dev/null <<'NGINXCONF'
server {
    listen 80;
    server_name estimatenepal.com www.estimatenepal.com;

    # Socket.io WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXCONF

echo "=== [3/4] Enabling site ==="
sudo ln -sf /etc/nginx/sites-available/estimatenepal /etc/nginx/sites-enabled/estimatenepal
sudo nginx -t
sudo systemctl reload nginx

echo "=== [4/4] Issuing SSL certificate ==="
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m bhattapuju3@gmail.com

echo ""
echo "=== Nginx + SSL done. Site live at https://$DOMAIN ==="
