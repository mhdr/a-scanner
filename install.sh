#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════
#  α-scanner installer — interactive, colorful, informative
# ══════════════════════════════════════════════════════════════════════

APP_NAME="a-scanner"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

# ---------- defaults (overridable via CLI flags) ----------
DEFAULT_PORT=3000
DEFAULT_INSTALL_DIR="/opt/a-scanner"
DEFAULT_BIND_ADDR="0.0.0.0"
DEFAULT_LOG_LEVEL="info"

# ---------- color helpers ----------

# We disable colors when stdout is not a terminal (e.g. piped to a file).
if [[ -t 1 ]]; then
    _R='\033[0;31m'   # red
    _G='\033[0;32m'   # green
    _Y='\033[0;33m'   # yellow / warning
    _B='\033[0;34m'   # blue
    _C='\033[0;36m'   # cyan
    _M='\033[0;35m'   # magenta
    _W='\033[1;37m'   # bold white
    _D='\033[0;90m'   # dim / gray
    _BOLD='\033[1m'
    _RESET='\033[0m'
else
    _R='' _G='' _Y='' _B='' _C='' _M='' _W='' _D='' _BOLD='' _RESET=''
fi

# Semantic message helpers
info()    { printf "${_C}  ℹ  ${_RESET}%s\n" "$*"; }
ok()      { printf "${_G}  ✔  ${_RESET}%s\n" "$*"; }
warn()    { printf "${_Y}  ⚠  ${_RESET}%s\n" "$*"; }
err()     { printf "${_R}  ✖  ${_RESET}%s\n" "$*" >&2; }
step()    { printf "\n${_B}━━━${_RESET} ${_BOLD}%s${_RESET}\n" "$*"; }
dim()     { printf "${_D}%s${_RESET}\n" "$*"; }
header()  { printf "${_M}%s${_RESET}\n" "$*"; }

# ---------- banner ----------

show_banner() {
    echo ""
    printf "${_C}"
    cat <<'BANNER'
     ___        ___
    /   |      / __| ___ __ _ _ _  _ _  ___ _ _
   / /| |_____\__ \/ _/ _` | ' \| ' \/ -_) '_|
  / ___ |_____|___/\__\__,_|_||_|_||_\___|_|
 /_/  |_|
BANNER
    printf "${_RESET}"
    printf "  ${_D}CDN IP Scanner — find clean IPs behind filtered networks${_RESET}\n"
    echo ""
}

# ---------- require root ----------

require_root() {
    if [[ $EUID -ne 0 ]]; then
        err "This script must be run as root."
        dim "    Try: sudo ./install.sh"
        exit 1
    fi
}

# ---------- usage ----------

usage() {
    show_banner
    cat <<EOF
${_BOLD}USAGE${_RESET}

  ${_W}Install / Update (interactive):${_RESET}
    sudo ./install.sh

  ${_W}Install with flags (non-interactive):${_RESET}
    sudo ./install.sh --port PORT --dir DIR --bind ADDR --log LEVEL --yes

  ${_W}Uninstall:${_RESET}
    sudo ./install.sh uninstall

${_BOLD}OPTIONS${_RESET}

  --port  PORT    Port the web UI listens on          (default: ${_C}${DEFAULT_PORT}${_RESET})
  --dir   DIR     Installation directory               (default: ${_C}${DEFAULT_INSTALL_DIR}${_RESET})
  --bind  ADDR    Bind address                         (default: ${_C}${DEFAULT_BIND_ADDR}${_RESET})
  --log   LEVEL   Log verbosity: trace,debug,info,warn (default: ${_C}${DEFAULT_LOG_LEVEL}${_RESET})
  --yes, -y       Accept all defaults (skip prompts)
  -h, --help      Show this help message

${_BOLD}EXAMPLES${_RESET}

  ${_D}# Interactive install (recommended for first-time setup)${_RESET}
  sudo ./install.sh

  ${_D}# Quick install with custom port, no prompts${_RESET}
  sudo ./install.sh --port 8080 --yes

  ${_D}# Uninstall and clean up${_RESET}
  sudo ./install.sh uninstall

EOF
}

# ---------- interactive prompt helper ----------
# ask VARIABLE "prompt text" "default value"
ask() {
    local varname="$1" prompt="$2" default="$3"
    local input
    printf "  ${_W}›${_RESET} %s ${_D}[%s]${_RESET}: " "$prompt" "$default"
    read -r input
    input="${input:-$default}"
    eval "$varname='$input'"
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

    # 2) Shipped alongside the script
    local local_binary="${script_dir}/${APP_NAME}"
    if [[ -f "$local_binary" ]]; then
        chmod +x "$local_binary"
        echo "$local_binary"
        return
    fi

    # 3) Passed via environment
    if [[ -n "${BINARY_PATH:-}" && -f "${BINARY_PATH}" ]]; then
        chmod +x "$BINARY_PATH"
        echo "$BINARY_PATH"
        return
    fi

    err "Could not find the ${APP_NAME} binary."
    echo ""
    dim "  Searched in:"
    dim "    ${repo_binary}"
    dim "    ${local_binary}"
    echo ""
    info "Either build first (./build.sh) or place the binary next to this script."
    exit 1
}

# ---------- validate helpers ----------

validate_port() {
    local port="$1"
    if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
        err "Port must be a number between 1 and 65535. Got: ${port}"
        exit 1
    fi
}

validate_log_level() {
    local level="$1"
    case "$level" in
        trace|debug|info|warn|error) ;;
        *)
            err "Invalid log level: ${level}"
            dim "  Valid levels: trace, debug, info, warn, error"
            exit 1
            ;;
    esac
}

validate_bind_addr() {
    local addr="$1"
    # Basic sanity check — allow IPv4 or 0.0.0.0 / 127.0.0.1 / etc.
    if ! [[ "$addr" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ "$addr" != "::" ]]; then
        err "Invalid bind address: ${addr}"
        dim "  Examples: 0.0.0.0 (all interfaces), 127.0.0.1 (localhost only), :: (IPv6 all)"
        exit 1
    fi
}

# ---------- interactive configuration ----------

interactive_config() {
    local auto_yes="$1"
    # If --yes was passed, skip the interactive prompts
    if [[ "$auto_yes" == "true" ]]; then
        return
    fi

    step "Configuration"
    echo ""
    info "Press Enter to accept the default value shown in brackets."
    echo ""

    # --- Port ---
    ask PORT "Port for the web UI" "$PORT"
    validate_port "$PORT"

    # --- Install directory ---
    ask INSTALL_DIR "Installation directory" "$INSTALL_DIR"

    # --- Bind address ---
    printf "\n"
    dim "  Bind address controls which network interfaces the server listens on."
    dim "  • 0.0.0.0  = listen on all interfaces (accessible from outside)"
    dim "  • 127.0.0.1 = localhost only (only this machine can access the UI)"
    ask BIND_ADDR "Bind address" "$BIND_ADDR"
    validate_bind_addr "$BIND_ADDR"

    # --- Log level ---
    printf "\n"
    dim "  Log level controls how verbose the application logs are."
    dim "  • info  = normal operation (recommended)"
    dim "  • debug = detailed logs for troubleshooting"
    dim "  • warn  = only warnings and errors"
    ask LOG_LEVEL "Log level (trace/debug/info/warn/error)" "$LOG_LEVEL"
    validate_log_level "$LOG_LEVEL"

    echo ""
}

# ---------- summary & confirm ----------

show_summary() {
    local binary_path="$1" auto_yes="$2"

    step "Installation Summary"
    echo ""
    printf "  ${_W}Binary source${_RESET}    %s\n" "$binary_path"
    printf "  ${_W}Install dir${_RESET}      %s\n" "$INSTALL_DIR"
    printf "  ${_W}Listen address${_RESET}   %s${_C}:${_RESET}%s\n" "$BIND_ADDR" "$PORT"
    printf "  ${_W}Log level${_RESET}        %s\n" "$LOG_LEVEL"
    printf "  ${_W}Service user${_RESET}     root\n"
    printf "  ${_W}Systemd unit${_RESET}     %s\n" "$SERVICE_FILE"
    printf "  ${_W}Database${_RESET}         %s/scanner.db\n" "$INSTALL_DIR"
    echo ""

    if [[ "$auto_yes" == "true" ]]; then
        return
    fi

    printf "  ${_W}›${_RESET} Proceed with installation? ${_D}[Y/n]${_RESET}: "
    local answer
    read -r answer
    answer="${answer:-y}"
    if [[ "${answer,,}" != "y" && "${answer,,}" != "yes" ]]; then
        warn "Installation cancelled."
        exit 0
    fi
}

# ---------- install ----------

do_install() {
    local auto_yes="$1"
    require_root

    # Banner already shown by action chooser; show it only if action came from CLI
    if [[ "$action_from_cli" == "true" || "$auto_yes" == "true" ]]; then
        show_banner
    fi

    # --- locate binary first (before asking questions) ---
    step "Locating binary"
    local binary_path
    binary_path="$(find_binary)"
    ok "Binary found: ${binary_path}"

    # --- check if this is an upgrade ---
    if systemctl is-active --quiet "${APP_NAME}.service" 2>/dev/null; then
        echo ""
        warn "${APP_NAME} is already running — this will perform an upgrade."
        dim "  The service will be restarted with the new binary."
    fi

    # --- interactive configuration ---
    interactive_config "$auto_yes"

    # --- show summary and confirm ---
    show_summary "$binary_path" "$auto_yes"

    # --- install binary ---
    step "Installing binary"
    mkdir -p "${INSTALL_DIR}"
    cp -f "${binary_path}" "${INSTALL_DIR}/${APP_NAME}"
    chmod 755 "${INSTALL_DIR}/${APP_NAME}"
    ok "Binary installed to ${INSTALL_DIR}/${APP_NAME}"

    # --- write systemd service ---
    step "Configuring systemd service"
    cat > "${SERVICE_FILE}" <<UNIT
[Unit]
Description=α-scanner — CDN IP scanner
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${APP_NAME}
Environment=LISTEN_ADDR=${BIND_ADDR}:${PORT}
Environment=DATABASE_URL=sqlite:${INSTALL_DIR}/scanner.db?mode=rwc
Environment=RUST_LOG=${LOG_LEVEL}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
    ok "Service file written to ${SERVICE_FILE}"

    # --- enable & start ---
    step "Starting service"
    systemctl daemon-reload
    systemctl enable --now "${APP_NAME}.service"
    ok "${APP_NAME} is now enabled and running."

    # --- final success message ---
    echo ""
    printf "${_G}  ╔══════════════════════════════════════════════════════════════╗${_RESET}\n"
    printf "${_G}  ║${_RESET}  ${_BOLD}✔  ${APP_NAME} installed successfully!${_RESET}                      ${_G}║${_RESET}\n"
    printf "${_G}  ╚══════════════════════════════════════════════════════════════╝${_RESET}\n"
    echo ""

    # --- access info ---
    local access_url
    if [[ "$BIND_ADDR" == "0.0.0.0" || "$BIND_ADDR" == "::" ]]; then
        local ip
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
        ip="${ip:-<server-ip>}"
        access_url="http://${ip}:${PORT}"
    else
        access_url="http://${BIND_ADDR}:${PORT}"
    fi

    printf "  ${_W}Web UI${_RESET}     ${_C}%s${_RESET}\n" "$access_url"
    printf "  ${_W}Database${_RESET}   %s/scanner.db\n" "$INSTALL_DIR"
    printf "  ${_W}Logs${_RESET}       journalctl -u ${APP_NAME} -f\n"
    echo ""

    header "  Useful commands:"
    echo ""
    printf "  ${_C}systemctl status ${APP_NAME}${_RESET}          check if the service is healthy\n"
    printf "  ${_C}systemctl restart ${APP_NAME}${_RESET}         restart after config changes\n"
    printf "  ${_C}journalctl -u ${APP_NAME} -f${_RESET}         follow live logs\n"
    printf "  ${_C}journalctl -u ${APP_NAME} --since today${_RESET}  today's logs\n"
    printf "  ${_C}sudo ./install.sh${_RESET}                 upgrade to a new version\n"
    printf "  ${_C}sudo ./install.sh uninstall${_RESET}       remove ${APP_NAME}\n"
    echo ""

    if [[ "$BIND_ADDR" == "0.0.0.0" || "$BIND_ADDR" == "::" ]]; then
        warn "The server is listening on all interfaces."
        dim "  Make sure port ${PORT} is open in your firewall if you want external access."
        dim "  Example (ufw): sudo ufw allow ${PORT}/tcp"
        echo ""
    fi
}

# ---------- uninstall ----------

do_uninstall() {
    require_root

    # Banner already shown by action chooser; show it only if action came from CLI
    if [[ "$action_from_cli" == "true" ]]; then
        show_banner
    fi

    step "Uninstalling ${APP_NAME}"
    echo ""

    # --- detect current install dir from service file ---
    local install_dir="${DEFAULT_INSTALL_DIR}"
    if [[ -f "${SERVICE_FILE}" ]]; then
        local detected_dir
        detected_dir=$(grep -oP 'WorkingDirectory=\K.*' "${SERVICE_FILE}" 2>/dev/null || true)
        if [[ -n "$detected_dir" ]]; then
            install_dir="$detected_dir"
        fi
    fi

    # --- stop service ---
    if systemctl is-active --quiet "${APP_NAME}.service" 2>/dev/null; then
        info "Stopping ${APP_NAME} service …"
        systemctl stop "${APP_NAME}.service"
        ok "Service stopped."
    else
        dim "  Service is not running."
    fi

    if systemctl is-enabled --quiet "${APP_NAME}.service" 2>/dev/null; then
        info "Disabling ${APP_NAME} service …"
        systemctl disable "${APP_NAME}.service"
        ok "Service disabled."
    fi

    # --- remove unit file ---
    if [[ -f "${SERVICE_FILE}" ]]; then
        rm -f "${SERVICE_FILE}"
        systemctl daemon-reload
        ok "Service file removed."
    fi

    # --- remove data directory ---
    if [[ -d "${install_dir}" ]]; then
        echo ""
        warn "The installation directory still exists: ${install_dir}"
        dim "  This includes the application binary and the SQLite database."
        dim "  Removing the database will permanently delete all scan results."
        echo ""
        printf "  ${_W}›${_RESET} Remove ${_Y}${install_dir}${_RESET} and all its data? ${_D}[y/N]${_RESET}: "
        local answer
        read -r answer
        if [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]]; then
            rm -rf "${install_dir}"
            ok "Directory ${install_dir} removed."
        else
            info "Directory ${install_dir} kept. You can remove it later with:"
            dim "    sudo rm -rf ${install_dir}"
        fi
    fi

    echo ""
    printf "${_G}  ╔══════════════════════════════════════════════════════════════╗${_RESET}\n"
    printf "${_G}  ║${_RESET}  ${_BOLD}✔  ${APP_NAME} uninstalled successfully.${_RESET}                    ${_G}║${_RESET}\n"
    printf "${_G}  ╚══════════════════════════════════════════════════════════════╝${_RESET}\n"
    echo ""
}

# ---------- action chooser ----------

choose_action() {
    # All display output must go to /dev/tty because this function is
    # called inside $(...) command substitution which captures stdout.
    show_banner > /dev/tty
    step "What would you like to do?" > /dev/tty
    echo "" > /dev/tty
    printf "  ${_C}1${_RESET})  ${_W}Install / Update${_RESET}   — install ${APP_NAME} or upgrade to a new version\n" > /dev/tty
    printf "  ${_C}2${_RESET})  ${_W}Uninstall${_RESET}          — stop and remove ${APP_NAME}\n" > /dev/tty
    echo "" > /dev/tty
    printf "  ${_W}›${_RESET} Choose an option ${_D}[1]${_RESET}: " > /dev/tty
    local choice
    read -r choice < /dev/tty
    choice="${choice:-1}"
    case "$choice" in
        1) echo "install" ;;
        2) echo "uninstall" ;;
        *)
            err "Invalid choice: ${choice}"
            exit 1
            ;;
    esac
}

# ---------- main ----------

main() {
    local action=""
    local auto_yes="false"
    local action_from_cli="false"

    # Mutable config — set from defaults, overridable by flags, then by prompts
    PORT="${DEFAULT_PORT}"
    INSTALL_DIR="${DEFAULT_INSTALL_DIR}"
    BIND_ADDR="${DEFAULT_BIND_ADDR}"
    LOG_LEVEL="${DEFAULT_LOG_LEVEL}"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            uninstall)
                action="uninstall"
                action_from_cli="true"
                shift
                ;;
            --port)
                [[ -z "${2:-}" ]] && { err "--port requires a value."; exit 1; }
                PORT="$2"
                validate_port "$PORT"
                shift 2
                ;;
            --dir)
                [[ -z "${2:-}" ]] && { err "--dir requires a value."; exit 1; }
                INSTALL_DIR="$2"
                shift 2
                ;;
            --bind)
                [[ -z "${2:-}" ]] && { err "--bind requires a value."; exit 1; }
                BIND_ADDR="$2"
                validate_bind_addr "$BIND_ADDR"
                shift 2
                ;;
            --log)
                [[ -z "${2:-}" ]] && { err "--log requires a value."; exit 1; }
                LOG_LEVEL="$2"
                validate_log_level "$LOG_LEVEL"
                shift 2
                ;;
            --yes|-y)
                auto_yes="true"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                err "Unknown argument: $1"
                echo ""
                usage
                exit 1
                ;;
        esac
    done

    # If no action was specified on the CLI, ask interactively
    if [[ -z "$action" ]]; then
        if [[ "$auto_yes" == "true" ]]; then
            action="install"
        else
            action="$(choose_action)"
        fi
    fi

    case "$action" in
        install)   do_install "$auto_yes" ;;
        uninstall) do_uninstall ;;
    esac
}

main "$@"
