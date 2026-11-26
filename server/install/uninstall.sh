#!/usr/bin/env bash
# device-mcp: remove the daemon (Linux and macOS).
#
#   device-mcp-uninstall
#   curl -fsSL <server>/uninstall.sh | bash
#
# Removes service, binary, configuration and job logs. ~/.claude-tools stays in place,
# it holds the scripts Claude has built. On Linux, linger stays enabled (it may affect other services too).
set -euo pipefail

CONFIG_HOME="$HOME/.config"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
LABEL="dev.onemo.device-mcp"

step() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

if [ "$(uname -s)" = "Darwin" ]; then
  step "Stopping and removing the launchd agent"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootout "user/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$HOME/Library/Logs/device-mcp.log"
elif command -v systemctl >/dev/null; then
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
  step "Stopping and removing the systemd user service"
  systemctl --user disable --now device-mcp.service 2>/dev/null || true
  rm -f "$CONFIG_HOME/systemd/user/device-mcp.service"
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user reset-failed device-mcp.service 2>/dev/null || true
fi

# Sessions that Claude created via session_start (prefix mcp-). Your own tmux sessions stay.
if command -v tmux >/dev/null; then
  for s in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^mcp-' || true); do
    step "Ending tmux session $s"
    tmux kill-session -t "=$s" 2>/dev/null || true
  done
fi

step "Removing binary, config and job logs"
rm -f "$HOME/.local/bin/device-mcp" "$HOME/.local/bin/device-mcp-uninstall"
# Leftovers of an aborted download or auto-update.
rm -f "$HOME/.local/bin"/.device-mcp.*
rm -rf "$CONFIG_HOME/device-mcp" "$STATE_HOME/device-mcp"

echo
echo "device-mcp has been removed."
echo "  Kept: $HOME/.claude-tools (your helper scripts). Delete with: rm -rf ~/.claude-tools"
if [ "$(uname -s)" != "Darwin" ]; then
  echo "  Linger is still enabled. Turn it off if no longer needed: loginctl disable-linger $(id -un)"
fi
echo "  Delete the device in the panel so its token becomes invalid."
