#!/usr/bin/env bash
# build-mobile.sh — Build the Android APK (Rust .so + React Native app)
#
# Prerequisites:
#   - Android NDK installed, ANDROID_NDK_HOME set (or NDK clang on PATH)
#   - Android SDK with build-tools & platform matching mobile/android/build.gradle
#   - Rust targets: rustup target add aarch64-linux-android armv7-linux-androideabi
#   - Node.js >= 22 and npm
#   - Java 17+ (for Gradle)
#
# Usage:
#   ./build-mobile.sh              # release build (default)
#   ./build-mobile.sh debug        # debug build
#   ./build-mobile.sh --skip-rust  # skip Rust build, only build APK (JS-only changes)

set -euo pipefail
cd "$(dirname "$0")"

# Rust target → Android ABI mapping
declare -A TARGET_ABI_MAP=(
    [aarch64-linux-android]=arm64-v8a
    [armv7-linux-androideabi]=armeabi-v7a
)
TARGETS=(aarch64-linux-android armv7-linux-androideabi)
ABIS="armeabi-v7a,arm64-v8a"

CRATE="a-scanner-mobile"
LIB_NAME="libmobile_backend.so"
JNILIBS_BASE="mobile/android/app/src/main/jniLibs"

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
# Step 1: Build Rust .so for each target (unless --skip-rust)
# ---------------------------------------------------------------------------

if [ "$SKIP_RUST" = false ]; then
    echo "=== Step 1: Building Rust $CRATE ($PROFILE) ==="

    # --- Locate Android NDK toolchain ----------------------------------
    if [ -z "${ANDROID_NDK_HOME:-}" ]; then
        # Auto-detect: pick the newest NDK under ~/Android/Sdk/ndk
        NDK_SEARCH="$HOME/Android/Sdk/ndk"
        if [ -d "$NDK_SEARCH" ]; then
            ANDROID_NDK_HOME="$(ls -1d "$NDK_SEARCH"/*/ 2>/dev/null | sort -V | tail -1)"
            ANDROID_NDK_HOME="${ANDROID_NDK_HOME%/}"
            echo "ℹ  Auto-detected ANDROID_NDK_HOME=$ANDROID_NDK_HOME"
        else
            echo "✗ ANDROID_NDK_HOME is not set and no NDK found in $NDK_SEARCH"
            exit 1
        fi
    fi

    NDK_BIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
    if [ ! -d "$NDK_BIN" ]; then
        echo "✗ NDK toolchain bin not found at $NDK_BIN"
        exit 1
    fi

    # Map Rust target → CC binary name (api-level 31)
    declare -A TARGET_CC_MAP=(
        [aarch64-linux-android]="aarch64-linux-android31-clang"
        [armv7-linux-androideabi]="armv7a-linux-androideabi31-clang"
    )

    # Export CC_<target> and AR_<target> so the cc crate finds the right compiler
    for TARGET in "${TARGETS[@]}"; do
        CC_NAME="${TARGET_CC_MAP[$TARGET]}"
        # cc crate looks for CC_<target-with-underscores>
        ENV_SUFFIX="${TARGET//-/_}"
        export "CC_${ENV_SUFFIX}=${NDK_BIN}/${CC_NAME}"
        export "AR_${ENV_SUFFIX}=${NDK_BIN}/llvm-ar"
    done

    for TARGET in "${TARGETS[@]}"; do
        ABI="${TARGET_ABI_MAP[$TARGET]}"
        JNILIBS_DIR="$JNILIBS_BASE/$ABI"

        echo ""
        echo "→ Building for $TARGET ($ABI) …"

        if ! rustup target list --installed | grep -q "$TARGET"; then
            echo "  Installing Rust target $TARGET …"
            rustup target add "$TARGET"
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
        echo "  ✓ $LIB_NAME ($SIZE) → $JNILIBS_DIR/"
    done
else
    echo "=== Step 1: Skipping Rust build (--skip-rust) ==="
    for TARGET in "${TARGETS[@]}"; do
        ABI="${TARGET_ABI_MAP[$TARGET]}"
        if [ ! -f "$JNILIBS_BASE/$ABI/$LIB_NAME" ]; then
            echo "✗ $JNILIBS_BASE/$ABI/$LIB_NAME not found. Run without --skip-rust first."
            exit 1
        fi
    done
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

# Ensure ANDROID_HOME is set for Gradle
if [ -z "${ANDROID_HOME:-}" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
fi
if [ ! -d "$ANDROID_HOME" ]; then
    echo "✗ ANDROID_HOME ($ANDROID_HOME) does not exist."
    exit 1
fi

# Generate local.properties if missing
LOCAL_PROPS="mobile/android/local.properties"
if [ ! -f "$LOCAL_PROPS" ]; then
    echo "sdk.dir=$ANDROID_HOME" > "$LOCAL_PROPS"
fi

cd mobile/android
./gradlew "$GRADLE_TASK" -PreactNativeArchitectures="$ABIS"
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
