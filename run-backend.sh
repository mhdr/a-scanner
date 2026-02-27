#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${LISTEN_ADDR:+${LISTEN_ADDR##*:}}"
PORT="${PORT:-3000}"

if pid=$(lsof -ti :"$PORT" 2>/dev/null); then
  echo "Port $PORT is in use (PID $pid). Killing..."
  kill -9 $pid 2>/dev/null || true
  sleep 0.5
fi

# Ensure frontend/dist exists so rust-embed compiles even without a frontend build
mkdir -p frontend/dist

echo "Starting backend in development mode..."
cargo run -p a-scanner-web
