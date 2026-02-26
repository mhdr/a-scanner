#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/frontend"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting frontend dev server..."
npm run dev
