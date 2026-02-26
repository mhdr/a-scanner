#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/backend"

echo "Starting backend in development mode..."
cargo run
