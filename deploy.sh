#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# --- Configuration ---
BINARY="target/x86_64-unknown-linux-musl/release/a-scanner"
DEPLOY_DIR="deploy"
PREFIX="a-scanner"

# --- Version (date-based: YYYY.MM.DD) ---
VERSION="$(date +%Y.%m.%d)"
ZIP_NAME="${PREFIX}-${VERSION}.zip"

# Handle same-day collisions by appending an incremental counter
if [[ -f "${DEPLOY_DIR}/${ZIP_NAME}" ]]; then
    COUNTER=1
    while [[ -f "${DEPLOY_DIR}/${PREFIX}-${VERSION}.${COUNTER}.zip" ]]; do
        ((COUNTER++))
    done
    ZIP_NAME="${PREFIX}-${VERSION}.${COUNTER}.zip"
    echo ">>> Zip for today already exists, using: ${ZIP_NAME}"
fi

echo "=== Packaging version ${ZIP_NAME%.zip} ==="

# --- Build ---
echo ">>> Running build..."
./build.sh

# --- Verify binary ---
if [[ ! -f "${BINARY}" ]]; then
    echo "ERROR: Binary not found at ${BINARY}" >&2
    echo "       Make sure the build completed successfully." >&2
    exit 1
fi

# --- Verify install.sh ---
if [[ ! -f "install.sh" ]]; then
    echo "ERROR: install.sh not found in project root." >&2
    exit 1
fi

# --- Create deploy directory ---
mkdir -p "${DEPLOY_DIR}"

# --- Create zip (flat structure: files at zip root) ---
echo ">>> Creating ${DEPLOY_DIR}/${ZIP_NAME}..."

# Use a temp directory to stage files so the zip has a flat structure
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "${STAGING_DIR}"' EXIT

cp "${BINARY}" "${STAGING_DIR}/a-scanner"
cp "install.sh" "${STAGING_DIR}/install.sh"

(cd "${STAGING_DIR}" && zip -9 "${OLDPWD}/${DEPLOY_DIR}/${ZIP_NAME}" a-scanner install.sh)

# --- Summary ---
ZIP_PATH="${DEPLOY_DIR}/${ZIP_NAME}"
ZIP_SIZE="$(du -h "${ZIP_PATH}" | cut -f1)"

echo ""
echo "=== Done ==="
echo "  Zip:     ${ZIP_PATH}"
echo "  Size:    ${ZIP_SIZE}"
echo "  Contents:"
unzip -l "${ZIP_PATH}" | tail -n +4 | head -n -2 | awk '{print "    " $4 " (" $1 " bytes)"}'
