#!/usr/bin/env bash
# device-mcp: Daemon entfernen.
#
#   device-mcp-uninstall
#   curl -fsSL <server>/uninstall.sh | bash
#
# Entfernt Service, Binary, Konfiguration und Job-Logs. ~/.claude-tools bleibt stehen,
# dort liegen die Scripts, die Claude gebaut hat. Linger bleibt aktiv (kann auch andere Dienste betreffen).
set -euo pipefail

CONFIG_HOME="$HOME/.config"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"

step() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

if command -v systemctl >/dev/null; then
  step "Stoppe und entferne den systemd-User-Service"
  systemctl --user disable --now device-mcp.service 2>/dev/null || true
  rm -f "$CONFIG_HOME/systemd/user/device-mcp.service"
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user reset-failed device-mcp.service 2>/dev/null || true
fi

step "Entferne Binary, Konfiguration und Job-Logs"
rm -f "$HOME/.local/bin/device-mcp" "$HOME/.local/bin/device-mcp-uninstall"
rm -rf "$CONFIG_HOME/device-mcp" "$STATE_HOME/device-mcp"

cat <<MSG

device-mcp ist entfernt.
  Geblieben: $HOME/.claude-tools (deine Helfer-Scripts). Löschen mit: rm -rf ~/.claude-tools
  Linger ist weiter aktiv. Abschalten, falls nicht mehr gebraucht: loginctl disable-linger $(id -un)
  Im Panel das Gerät löschen, damit der Token ungültig wird.
MSG
