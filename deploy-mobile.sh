#!/usr/bin/env bash
# deploy-mobile.sh — Build and package the Android APK for distribution
#
# Produces: deploy/a-scanner-mobile-YYYY.MM.DD.apk
# (increments counter on same-day collisions, like deploy.sh does for web)

set -euo pipefail
cd "$(dirname "$0")"

DEPLOY_DIR="deploy"
PREFIX="a-scanner-mobile"
VERSION="$(date +%Y.%m.%d)"
APK_NAME="${PREFIX}-${VERSION}.apk"

# Handle same-day collisions
if [[ -f "${DEPLOY_DIR}/${APK_NAME}" ]]; then
    COUNTER=1
    while [[ -f "${DEPLOY_DIR}/${PREFIX}-${VERSION}.${COUNTER}.apk" ]]; do
        ((COUNTER++))
    done
    APK_NAME="${PREFIX}-${VERSION}.${COUNTER}.apk"
    echo ">>> APK for today already exists, using: ${APK_NAME}"
fi

echo "=== Packaging mobile ${APK_NAME%.apk} ==="

# --- Build ---
echo ">>> Running build-mobile.sh (release) ..."
./build-mobile.sh release

# --- Locate source APK ---
SRC_APK="mobile/android/app/build/outputs/apk/release/app-release.apk"

if [[ ! -f "$SRC_APK" ]]; then
    echo "ERROR: Release APK not found at ${SRC_APK}" >&2
    echo "       Make sure the build completed successfully." >&2
    exit 1
fi

# --- Copy to deploy directory ---
mkdir -p "${DEPLOY_DIR}"
cp "$SRC_APK" "${DEPLOY_DIR}/${APK_NAME}"

APK_SIZE="$(du -h "${DEPLOY_DIR}/${APK_NAME}" | cut -f1)"

echo ""
echo "=== Done ==="
echo "  APK:  ${DEPLOY_DIR}/${APK_NAME}"
echo "  Size: ${APK_SIZE}"
echo ""
echo "Install on device:"
echo "  adb install ${DEPLOY_DIR}/${APK_NAME}"
