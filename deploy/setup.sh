#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y nodejs sqlite3
npm install --omit=dev
mkdir -p data public/uploads backups
if [ ! -f .env ]; then cp .env.example .env; fi
if grep -q 'change-me-now' .env; then sed -i "s/change-me-now/$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)/" .env; fi
if grep -q 'replace-with-a-long-random-secret' .env; then sed -i "s/replace-with-a-long-random-secret/$(openssl rand -hex 32)/" .env; fi
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | bash || true
sudo ufw allow 3001/tcp || true
mkdir -p "$HOME/.config/hardware-bom"
(crontab -l 2>/dev/null | grep -v 'hardware-bom backup' || true; echo '17 3 * * * cd '"$PWD"' && ./deploy/backup.sh # hardware-bom backup') | crontab -
