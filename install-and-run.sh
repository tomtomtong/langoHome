#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl build-essential python3

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

exec npm start
