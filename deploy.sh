#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Building frontend ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Building backend (release) ==="
cd backend
cargo build --release
cd ..

BINARY="backend/target/release/a-scanner-backend"

if [ -f "$BINARY" ]; then
  echo ""
  echo "=== Build complete ==="
  echo "Single executable: $BINARY"
  echo "Run it with: ./$BINARY"
else
  echo "ERROR: Build failed, executable not found."
  exit 1
fi
