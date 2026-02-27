#!/usr/bin/env bash
# build-mobile.sh — Build the mobile-backend .so for Android (arm64-v8a)
#
# Prerequisites:
#   - Android NDK installed, ANDROID_NDK_HOME set
#   - NDK toolchain bin dir on PATH (or full path in .cargo/config.toml)
#   - Rust target installed: rustup target add aarch64-linux-android
#
# Usage:
#   ./build-mobile.sh          # release build (default)
#   ./build-mobile.sh debug    # debug build

set -euo pipefail

TARGET="aarch64-linux-android"
CRATE="mobile-backend"
LIB_NAME="libmobile_backend.so"
JNILIBS_DIR="mobile/android/app/src/main/jniLibs/arm64-v8a"

PROFILE="${1:-release}"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

if ! rustup target list --installed | grep -q "$TARGET"; then
    echo "→ Installing Rust target $TARGET …"
    rustup target add "$TARGET"
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    echo "⚠  ANDROID_NDK_HOME is not set."
    echo "   The build will still work if the NDK clang is already on your PATH"
    echo "   (see .cargo/config.toml)."
fi

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

echo "→ Building $CRATE for $TARGET ($PROFILE) …"

if [ "$PROFILE" = "release" ]; then
    cargo build --target "$TARGET" -p "$CRATE" --release
    SO_PATH="target/$TARGET/release/$LIB_NAME"
else
    cargo build --target "$TARGET" -p "$CRATE"
    SO_PATH="target/$TARGET/debug/$LIB_NAME"
fi

if [ ! -f "$SO_PATH" ]; then
    echo "✗ Build succeeded but $SO_PATH not found."
    exit 1
fi

# ---------------------------------------------------------------------------
# Copy to jniLibs
# ---------------------------------------------------------------------------

mkdir -p "$JNILIBS_DIR"
cp "$SO_PATH" "$JNILIBS_DIR/$LIB_NAME"

SIZE=$(du -h "$JNILIBS_DIR/$LIB_NAME" | cut -f1)
echo "✓ $LIB_NAME ($SIZE) → $JNILIBS_DIR/"
