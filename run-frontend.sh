#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/frontend"

PORT=5173

if pid=$(lsof -ti :"$PORT" 2>/dev/null); then
  echo "Port $PORT is in use (PID $pid). Killing..."
  kill -9 $pid 2>/dev/null || true
  sleep 0.5
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting frontend dev server..."
npm run dev
