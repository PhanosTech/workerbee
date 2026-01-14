#!/usr/bin/env sh
set -eu

APP_NAME="workerbee"
APP_DIR="/opt/workerbee"
DATA_DIR="/opt/workerbee/data"
CONFIG_PATH="/opt/workerbee/config.json"
SERVICE_PATH="/etc/systemd/system/${APP_NAME}.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (try: sudo $0)" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$APP_NAME" >/dev/null 2>&1 || true
  systemctl disable "$APP_NAME" >/dev/null 2>&1 || true
fi

rm -f "$SERVICE_PATH"
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
fi

# Remove installed app files but keep data and config.
if [ -d "$APP_DIR" ]; then
  find "$APP_DIR" -mindepth 1 -maxdepth 1 \
    ! -name "data" \
    ! -name "$(basename "$CONFIG_PATH")" \
    -exec rm -rf {} +
fi

echo "Uninstalled ${APP_NAME} service."
echo "Kept config: ${CONFIG_PATH}"
echo "Kept data dir: ${DATA_DIR}"

