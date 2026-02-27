#!/usr/bin/env bash
# build-mobile.sh — Build the Android APK (Rust .so + React Native app)
#
# Prerequisites:
#   - Android NDK installed, ANDROID_NDK_HOME set (or NDK clang on PATH)
#   - Android SDK with build-tools & platform matching mobile/android/build.gradle
#   - Rust target installed: rustup target add aarch64-linux-android
#   - Node.js >= 22 and npm
#   - Java 17+ (for Gradle)
#
# Usage:
#   ./build-mobile.sh              # release build (default)
#   ./build-mobile.sh debug        # debug build
#   ./build-mobile.sh --skip-rust  # skip Rust build, only build APK (JS-only changes)

set -euo pipefail
cd "$(dirname "$0")"

TARGET="aarch64-linux-android"
CRATE="mobile-backend"
LIB_NAME="libmobile_backend.so"
JNILIBS_DIR="mobile/android/app/src/main/jniLibs/arm64-v8a"

PROFILE="release"
SKIP_RUST=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

for arg in "$@"; do
    case "$arg" in
        debug)       PROFILE="debug" ;;
        release)     PROFILE="release" ;;
        --skip-rust) SKIP_RUST=true ;;
        *)
            echo "Usage: $0 [debug|release] [--skip-rust]"
            exit 1
            ;;
    esac
done

if [ "$PROFILE" = "release" ]; then
    GRADLE_TASK="assembleRelease"
else
    GRADLE_TASK="assembleDebug"
fi

# ---------------------------------------------------------------------------
# Step 1: Build Rust .so (unless --skip-rust)
# ---------------------------------------------------------------------------

if [ "$SKIP_RUST" = false ]; then
    echo "=== Step 1: Building Rust $CRATE for $TARGET ($PROFILE) ==="

    if ! rustup target list --installed | grep -q "$TARGET"; then
        echo "→ Installing Rust target $TARGET …"
        rustup target add "$TARGET"
    fi

    if [ -z "${ANDROID_NDK_HOME:-}" ]; then
        echo "⚠  ANDROID_NDK_HOME is not set."
        echo "   The build will still work if the NDK clang is already on your PATH"
        echo "   (see .cargo/config.toml)."
    fi

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

    mkdir -p "$JNILIBS_DIR"
    cp "$SO_PATH" "$JNILIBS_DIR/$LIB_NAME"

    SIZE=$(du -h "$JNILIBS_DIR/$LIB_NAME" | cut -f1)
    echo "✓ $LIB_NAME ($SIZE) → $JNILIBS_DIR/"
else
    echo "=== Step 1: Skipping Rust build (--skip-rust) ==="
    if [ ! -f "$JNILIBS_DIR/$LIB_NAME" ]; then
        echo "✗ $JNILIBS_DIR/$LIB_NAME not found. Run without --skip-rust first."
        exit 1
    fi
fi

echo ""

# ---------------------------------------------------------------------------
# Step 2: Install JS dependencies
# ---------------------------------------------------------------------------

echo "=== Step 2: Installing mobile JS dependencies ==="
cd mobile
npm install --prefer-offline
cd ..
echo ""

# ---------------------------------------------------------------------------
# Step 3: Build APK via Gradle
# ---------------------------------------------------------------------------

echo "=== Step 3: Building Android APK ($GRADLE_TASK) ==="
cd mobile/android
./gradlew "$GRADLE_TASK" -PreactNativeArchitectures=arm64-v8a
cd ../..

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

if [ "$PROFILE" = "release" ]; then
    APK_PATH="mobile/android/app/build/outputs/apk/release/app-release.apk"
else
    APK_PATH="mobile/android/app/build/outputs/apk/debug/app-debug.apk"
fi

if [ -f "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    echo ""
    echo "=== Build complete ==="
    echo "  APK:  $APK_PATH"
    echo "  Size: $APK_SIZE"
    echo ""
    echo "Install on device:"
    echo "  adb install $APK_PATH"
else
    echo ""
    echo "✗ APK not found at $APK_PATH"
    echo "  Check Gradle output above for errors."
    exit 1
fi
