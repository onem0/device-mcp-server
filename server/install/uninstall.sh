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
  step "Stopping and removing the systemd user service"
  systemctl --user disable --now device-mcp.service 2>/dev/null || true
  rm -f "$CONFIG_HOME/systemd/user/device-mcp.service"
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user reset-failed device-mcp.service 2>/dev/null || true
fi

# Sessions, die Claude über session_start angelegt hat (Präfix mcp-). Eigene tmux-Sessions bleiben.
if command -v tmux >/dev/null; then
  for s in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^mcp-' || true); do
    step "Ending tmux session $s"
    tmux kill-session -t "=$s" 2>/dev/null || true
  done
fi

step "Removing binary, config and job logs"
rm -f "$HOME/.local/bin/device-mcp" "$HOME/.local/bin/device-mcp-uninstall"
rm -rf "$CONFIG_HOME/device-mcp" "$STATE_HOME/device-mcp"

cat <<MSG

device-mcp has been removed.
  Kept: $HOME/.claude-tools (your helper scripts). Delete with: rm -rf ~/.claude-tools
  Linger is still enabled. Turn it off if no longer needed: loginctl disable-linger $(id -un)
  Delete the device in the panel so its token becomes invalid.
MSG
