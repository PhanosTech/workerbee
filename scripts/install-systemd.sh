#!/usr/bin/env sh
set -eu

APP_NAME="workerbee"
APP_USER="workerbee"
APP_GROUP="workerbee"
APP_DIR="/opt/workerbee"
DATA_DIR="/opt/workerbee/data"
CONFIG_PATH="/opt/workerbee/config.json"
SERVICE_PATH="/etc/systemd/system/${APP_NAME}.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (try: sudo $0)" >&2
  exit 1
fi

if [ ! -d "dist" ]; then
  echo "Missing dist/. Run: npm run build (or task run) before installing." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd (systemctl) is required." >&2
  exit 1
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_DIR" "$DATA_DIR"

if [ ! -f "$CONFIG_PATH" ]; then
  cat >"$CONFIG_PATH" <<'JSON'
{
  "host": "0.0.0.0",
  "webPort": 9229,
  "apiPort": 9339
}
JSON
fi

chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR"

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

mkdir -p "$tmp_dir/scripts"

cp -f package.json package-lock.json "$tmp_dir/"
cp -f server.js database.js "$tmp_dir/"
cp -rf dist "$tmp_dir/"
cp -f scripts/workerbee-service.js "$tmp_dir/scripts/"

chown -R "$APP_USER:$APP_GROUP" "$tmp_dir"

# Remove everything except persisted data + config, then copy fresh app files.
find "$APP_DIR" -mindepth 1 -maxdepth 1 \
  ! -name "data" \
  ! -name "$(basename "$CONFIG_PATH")" \
  -exec rm -rf {} +

cp -rf "$tmp_dir/"* "$APP_DIR/"

chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
chmod 755 "$APP_DIR" "$APP_DIR/scripts" "$APP_DIR/dist"
chmod 755 "$APP_DIR/scripts/workerbee-service.js"

(
  cd "$APP_DIR"
  su -s /bin/sh "$APP_USER" -c "npm ci --omit=dev"
)

cat >"$SERVICE_PATH" <<EOF
[Unit]
Description=WorkerBee (local task manager)
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=WORKERBEE_CONFIG=$CONFIG_PATH
Environment=WORKERBEE_DATA_DIR=$DATA_DIR
ExecStart=$(command -v node) $APP_DIR/scripts/workerbee-service.js
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$APP_NAME"

echo "Installed and started ${APP_NAME}. Service: systemctl status ${APP_NAME}"
echo "Config: ${CONFIG_PATH}"
echo "Data: ${DATA_DIR}/workbee.json"
