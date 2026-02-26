#!/usr/bin/env bash
set -euo pipefail

APP_NAME="a-scanner"
APP_USER="a-scanner"
APP_GROUP="a-scanner"
INSTALL_DIR="/opt/a-scanner"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
DEFAULT_PORT=3000

# ---------- helpers ----------

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

require_root() {
    if [[ $EUID -ne 0 ]]; then
        red "Error: This script must be run as root (use sudo)."
        exit 1
    fi
}

usage() {
    cat <<EOF
Usage:
  $(bold "Install / Update:")
    sudo ./install.sh [--port PORT]        Install or update ${APP_NAME}.
                                           Default port: ${DEFAULT_PORT}

  $(bold "Uninstall:")
    sudo ./install.sh uninstall            Stop, disable and remove ${APP_NAME}.

Options:
  --port PORT    Port the application will listen on (default: ${DEFAULT_PORT}).
  -h, --help     Show this help message.
EOF
}

# ---------- find binary ----------

find_binary() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # 1) Built from repo
    local repo_binary="${script_dir}/backend/target/release/${APP_NAME}"
    if [[ -x "$repo_binary" ]]; then
        echo "$repo_binary"
        return
    fi

    # 2) Shipped alongside the script (e.g. scp binary + install.sh to server)
    local local_binary="${script_dir}/${APP_NAME}"
    if [[ -x "$local_binary" ]]; then
        echo "$local_binary"
        return
    fi

    # 3) Passed via environment
    if [[ -n "${BINARY_PATH:-}" && -x "${BINARY_PATH}" ]]; then
        echo "$BINARY_PATH"
        return
    fi

    red "Error: Could not find the ${APP_NAME} binary."
    echo "Looked in:"
    echo "  ${repo_binary}"
    echo "  ${local_binary}"
    echo ""
    echo "Either build first (./build.sh) or place the binary next to this script."
    exit 1
}

# ---------- install ----------

do_install() {
    local port="$1"
    require_root

    bold "Installing ${APP_NAME} …"

    # --- binary ---
    local binary_path
    binary_path="$(find_binary)"
    echo "Binary found: ${binary_path}"

    # --- system user ---
    if id "${APP_USER}" &>/dev/null; then
        echo "System user '${APP_USER}' already exists."
    else
        useradd --system --no-create-home --shell /usr/sbin/nologin "${APP_USER}"
        echo "Created system user '${APP_USER}'."
    fi

    # --- install directory ---
    mkdir -p "${INSTALL_DIR}"
    cp -f "${binary_path}" "${INSTALL_DIR}/${APP_NAME}"
    chmod 755 "${INSTALL_DIR}/${APP_NAME}"
    chown -R "${APP_USER}:${APP_GROUP}" "${INSTALL_DIR}"
    echo "Binary installed to ${INSTALL_DIR}/${APP_NAME}"

    # --- systemd unit ---
    cat > "${SERVICE_FILE}" <<UNIT
[Unit]
Description=α-scanner — CDN IP scanner
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${APP_NAME}
Environment=LISTEN_ADDR=0.0.0.0:${port}
Environment=DATABASE_URL=sqlite:${INSTALL_DIR}/scanner.db?mode=rwc
Environment=RUST_LOG=info
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

    echo "Systemd service written to ${SERVICE_FILE}"

    # --- activate ---
    systemctl daemon-reload
    systemctl enable --now "${APP_NAME}.service"

    echo ""
    green "✓ ${APP_NAME} installed and running on port ${port}"
    echo ""
    echo "Useful commands:"
    echo "  systemctl status ${APP_NAME}      — check service status"
    echo "  journalctl -u ${APP_NAME} -f      — follow logs"
    echo "  sudo ./install.sh uninstall       — remove ${APP_NAME}"
}

# ---------- uninstall ----------

do_uninstall() {
    require_root
    bold "Uninstalling ${APP_NAME} …"

    # --- stop service ---
    if systemctl is-active --quiet "${APP_NAME}.service" 2>/dev/null; then
        systemctl stop "${APP_NAME}.service"
        echo "Service stopped."
    fi

    if systemctl is-enabled --quiet "${APP_NAME}.service" 2>/dev/null; then
        systemctl disable "${APP_NAME}.service"
        echo "Service disabled."
    fi

    # --- remove unit file ---
    if [[ -f "${SERVICE_FILE}" ]]; then
        rm -f "${SERVICE_FILE}"
        systemctl daemon-reload
        echo "Service file removed."
    fi

    # --- remove data directory ---
    if [[ -d "${INSTALL_DIR}" ]]; then
        echo ""
        read -rp "Remove ${INSTALL_DIR} (includes database)? [y/N] " answer
        if [[ "${answer,,}" == "y" ]]; then
            rm -rf "${INSTALL_DIR}"
            echo "Directory ${INSTALL_DIR} removed."
        else
            echo "Directory ${INSTALL_DIR} kept."
        fi
    fi

    # --- remove user ---
    if id "${APP_USER}" &>/dev/null; then
        read -rp "Remove system user '${APP_USER}'? [y/N] " answer
        if [[ "${answer,,}" == "y" ]]; then
            userdel "${APP_USER}"
            echo "User '${APP_USER}' removed."
        else
            echo "User '${APP_USER}' kept."
        fi
    fi

    echo ""
    green "✓ ${APP_NAME} uninstalled."
}

# ---------- main ----------

main() {
    local port="${DEFAULT_PORT}"
    local action="install"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            uninstall)
                action="uninstall"
                shift
                ;;
            --port)
                if [[ -z "${2:-}" ]]; then
                    red "Error: --port requires a value."
                    exit 1
                fi
                port="$2"
                if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
                    red "Error: Port must be a number between 1 and 65535."
                    exit 1
                fi
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                red "Unknown argument: $1"
                usage
                exit 1
                ;;
        esac
    done

    case "$action" in
        install)   do_install "$port" ;;
        uninstall) do_uninstall ;;
    esac
}

main "$@"
