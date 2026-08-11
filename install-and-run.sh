#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MAJOR="${NODE_MAJOR:-20}"
CRON_INTERVAL="${CRON_INTERVAL:-*/5 * * * *}"
NGINX_UPLOAD_LIMIT="${NGINX_UPLOAD_LIMIT:-500m}"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl build-essential python3 nginx

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi

cd "$APP_DIR"
npm ci --omit=dev

mkdir -p "$APP_DIR/data"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-4000}"
export CONFIG_DIR="${CONFIG_DIR:-$APP_DIR/data}"

# --- auto-update cron job ---
AUTO_UPDATE_SCRIPT="$APP_DIR/auto-update.sh"
cat > "$AUTO_UPDATE_SCRIPT" << AUTOUPDATE
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$APP_DIR"
NGINX_UPLOAD_LIMIT="${NGINX_UPLOAD_LIMIT}"
cd "\$APP_DIR"
git fetch origin main
LOCAL=\$(git rev-parse HEAD)
REMOTE=\$(git rev-parse origin/main)
if [ "\$LOCAL" != "\$REMOTE" ]; then
  git pull origin main
  npm ci --omit=dev
  cat > /tmp/langohome-upload.conf << NGINXEOF
client_max_body_size \$NGINX_UPLOAD_LIMIT;
proxy_request_buffering off;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
NGINXEOF
  sudo mv /tmp/langohome-upload.conf /etc/nginx/conf.d/langohome-upload.conf
  sudo nginx -t
  sudo systemctl reload nginx || sudo systemctl restart nginx
  sudo systemctl restart langohome
fi
AUTOUPDATE
chmod +x "$AUTO_UPDATE_SCRIPT"

NGINX_UPLOAD_CONFIG="/etc/nginx/conf.d/langohome-upload.conf"
cat > /tmp/langohome-upload.conf << NGINXEOF
client_max_body_size $NGINX_UPLOAD_LIMIT;
proxy_request_buffering off;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
NGINXEOF
$SUDO mv /tmp/langohome-upload.conf "$NGINX_UPLOAD_CONFIG"
$SUDO nginx -t
$SUDO systemctl enable nginx
$SUDO systemctl reload nginx || $SUDO systemctl restart nginx

# --- systemd service ---
SERVICE_FILE="/etc/systemd/system/langohome.service"
cat > /tmp/langohome.service << SERVICEEOF
[Unit]
Description=LangoHome Server
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$APP_DIR
Environment="NODE_ENV=${NODE_ENV:-production}"
Environment="PORT=${PORT:-4000}"
Environment="CONFIG_DIR=${CONFIG_DIR:-$APP_DIR/data}"
ExecStart=$(command -v node) $APP_DIR/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF
$SUDO mv /tmp/langohome.service "$SERVICE_FILE"
$SUDO systemctl daemon-reload
$SUDO systemctl enable langohome

# --- cron job ---
( crontab -l 2>/dev/null | grep -v "$AUTO_UPDATE_SCRIPT" ; echo "$CRON_INTERVAL $AUTO_UPDATE_SCRIPT" ) | crontab -

# --- start ---
$SUDO systemctl restart langohome
echo "LangoHome installed and running. Auto-update cron: $CRON_INTERVAL. Nginx upload limit: $NGINX_UPLOAD_LIMIT"
