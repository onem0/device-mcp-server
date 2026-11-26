#!/usr/bin/env bash
# device-mcp: install or update the daemon (Linux with systemd, macOS with launchd).
#
#   curl -fsSL __SERVER_URL__/install.sh | DEVICE_MCP_TOKEN='dmcp_…' bash
#
# The script fetches the daemon from the server it was downloaded from and connects it to exactly that server.
# Running it again updates binary and service. Without DEVICE_MCP_TOKEN the token from the existing config is kept.
# The daemon runs as the user who runs this script, not as root.
# Later updates are triggered by the server: by a click in the panel or, if turned on there, automatically.
#
# Must also run with the bash 3.2 that ships with macOS.
set -euo pipefail

SERVER_URL="${DEVICE_MCP_SERVER:-__SERVER_URL__}"
SERVER_URL="${SERVER_URL%/}"
TOKEN="${DEVICE_MCP_TOKEN:-}"

BIN_DIR="$HOME/.local/bin"
BIN="$BIN_DIR/device-mcp"
UNINSTALL_BIN="$BIN_DIR/device-mcp-uninstall"
# Fixed location that the unit file (%h/.config) and the daemon also find without XDG variables.
CONFIG_HOME="$HOME/.config"
CONFIG_DIR="$CONFIG_HOME/device-mcp"
CONFIG="$CONFIG_DIR/config.json"
ENV_FILE="$CONFIG_DIR/env"
TOOLS_DIR="$HOME/.claude-tools"
# Linux
UNIT_DIR="$CONFIG_HOME/systemd/user"
UNIT="$UNIT_DIR/device-mcp.service"
# macOS
LABEL="dev.onemo.device-mcp"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/$LABEL.plist"
LOG_FILE="$HOME/Library/Logs/device-mcp.log"
DOMAIN=""

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mNote:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Prerequisites ---------------------------------------------------------

case "$(uname -s)" in
  Linux) OS=linux ;;
  Darwin) OS=darwin ;;
  *) fail "The daemon runs on Linux and macOS, not on $(uname -s)." ;;
esac
if [ "$(id -u)" = "0" ] && [ "${DEVICE_MCP_ALLOW_ROOT:-}" != "1" ]; then
  fail "Please run as a normal user, not as root (the daemon runs as this user). To do it anyway: DEVICE_MCP_ALLOW_ROOT=1."
fi
command -v curl >/dev/null || fail "curl is missing."
command -v gzip >/dev/null || fail "gzip is missing."
command -v bash >/dev/null || fail "bash is missing."
if [ "$OS" = linux ]; then
  command -v systemctl >/dev/null || fail "systemd is missing (systemctl not found)."
else
  command -v launchctl >/dev/null || fail "launchctl is missing."
fi
case "$SERVER_URL" in
  http://*|https://*) ;;
  *) fail "Server URL '$SERVER_URL' is invalid. Set DEVICE_MCP_SERVER=https://…" ;;
esac
case "$SERVER_URL" in *'"'*|*'\'*) fail "Server URL contains invalid characters." ;; esac

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) fail "Architecture $(uname -m) is not supported (only x86_64 and aarch64/arm64)." ;;
esac

if [ -z "$TOKEN" ] && [ -f "$CONFIG" ]; then
  TOKEN="$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG" | head -n1)"
  [ -n "$TOKEN" ] && step "Keeping the token from $CONFIG"
fi
[ -n "$TOKEN" ] || fail "No device token. Add the device in the panel ($SERVER_URL), it shows the full command: curl -fsSL $SERVER_URL/install.sh | DEVICE_MCP_TOKEN='dmcp_…' bash"
case "$TOKEN" in
  *[!A-Za-z0-9_-]*) fail "The token contains invalid characters. Copy it again from the panel." ;;
esac

if [ "$OS" = linux ]; then
  # systemctl --user needs the runtime environment of the user session, also via SSH or su.
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
  SYSTEM_NAME="$( (. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-Linux}") || echo Linux )"
else
  SYSTEM_NAME="macOS $(sw_vers -productVersion 2>/dev/null || true)"
fi

bold "Setting up device-mcp for $(id -un)@$(hostname) ($OS-$ARCH), server $SERVER_URL"

# --- Binary ----------------------------------------------------------------

step "Downloading the daemon"
mkdir -p "$BIN_DIR"
TMP_BIN="$(mktemp "$BIN_DIR/.device-mcp.XXXXXX")"
trap 'rm -f "$TMP_BIN"' EXIT
curl -fSL --progress-bar "$SERVER_URL/download/device-mcp-$OS-$ARCH.gz" | gzip -dc > "$TMP_BIN" \
  || fail "Download of $SERVER_URL/download/device-mcp-$OS-$ARCH.gz failed."
chmod 755 "$TMP_BIN"
"$TMP_BIN" --version >/dev/null 2>&1 || fail "The downloaded binary does not run on this system."
# mv replaces the file atomically; a running daemon keeps the old version until it restarts.
mv -f "$TMP_BIN" "$BIN"
trap - EXIT
step "Daemon $("$BIN" --version) at $BIN"

# --- Configuration ---------------------------------------------------------

step "Writing $CONFIG"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
(
  umask 077
  printf '{\n  "serverUrl": "%s",\n  "token": "%s"\n}\n' "$SERVER_URL" "$TOKEN" > "$CONFIG"
)
chmod 600 "$CONFIG"

# The service gets the PATH of this shell so that Claude finds the same programs as you do (nvm, Homebrew, ~/.local/bin, …).
# systemd reads it from the env file. launchd has nothing like that, there it goes into the plist.
SERVICE_PATH="$BIN_DIR:$PATH"
if [ "$OS" = linux ]; then
  (
    umask 077
    {
      echo "# Written by install.sh. Environment for the device-mcp service."
      printf 'PATH=%s\n' "$SERVICE_PATH"
      if [ -n "${LANG:-}" ]; then printf 'LANG=%s\n' "$LANG"; fi
    } > "$ENV_FILE"
  )
fi

# --- ~/.claude-tools -------------------------------------------------------

mkdir -p "$TOOLS_DIR"
if [ ! -f "$TOOLS_DIR/README.md" ]; then
  step "Creating $TOOLS_DIR/README.md"
  cat > "$TOOLS_DIR/README.md" <<README
# Claude tools on $(hostname)

Helper scripts Claude has built on this device. Before Claude builds something new,
it reads this file. Every new script goes into this directory and gets an entry here.

- User: $(id -un)
- System: $SYSTEM_NAME, $(uname -m)
- Created: $(date -u +%Y-%m-%d)

## Scripts

| Script | Purpose | Usage |
|---|---|---|
| – | No scripts yet. | – |

## Notes

Things about this device Claude should know next time (paths, services, quirks).
README
else
  step "$TOOLS_DIR/README.md already exists, leaving it unchanged"
fi

# --- Service: systemd (Linux) ----------------------------------------------

setup_systemd() {
  step "Setting up the systemd user service"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT" <<'UNIT'
[Unit]
Description=device-mcp daemon (commands and files for Claude)
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=%h/.local/bin/device-mcp
WorkingDirectory=%h
EnvironmentFile=-%h/.config/device-mcp/env
# This tells the daemon that it may simply exit after an update: systemd starts the new binary.
Environment=DEVICE_MCP_SUPERVISED=1
Restart=always
RestartSec=5
# Jobs run in their own process groups; they should end too when the service is stopped.
KillMode=control-group
TimeoutStopSec=15

[Install]
WantedBy=default.target
UNIT

  # So that the daemon starts after a reboot without a login.
  if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)" != "yes" ]; then
    step "Enabling linger for $(id -un)"
    if ! loginctl enable-linger "$(id -un)" 2>/dev/null; then
      if command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
        sudo loginctl enable-linger "$(id -un)"
      elif command -v sudo >/dev/null && [ -r /dev/tty ]; then
        echo "'loginctl enable-linger' needs your sudo password once."
        sudo loginctl enable-linger "$(id -un)" < /dev/tty || warn "Linger not enabled. After a reboot the daemon only starts when you log in. Fix later: sudo loginctl enable-linger $(id -un)"
      else
        warn "Linger not enabled. After a reboot the daemon only starts when you log in. Fix later: sudo loginctl enable-linger $(id -un)"
      fi
    fi
  fi

  # After enable-linger systemd starts the user manager, which can take a moment.
  for _ in $(seq 1 20); do
    [ -S "$XDG_RUNTIME_DIR/bus" ] && break
    sleep 0.5
  done
  systemctl --user daemon-reload || fail "systemctl --user does not work. Is a user session running? Log in via 'ssh' instead of 'su' if needed."
  systemctl --user enable device-mcp.service >/dev/null
  systemctl --user restart device-mcp.service
}

# --- Service: launchd (macOS) ----------------------------------------------

xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# The user's LaunchAgent: starts at login, launchd restarts the daemon every time it exits.
setup_launchd() {
  step "Setting up the launchd agent"
  mkdir -p "$PLIST_DIR" "$(dirname "$LOG_FILE")"
  {
    cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$BIN")</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(xml_escape "$HOME")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(xml_escape "$SERVICE_PATH")</string>
    <key>DEVICE_MCP_SUPERVISED</key>
    <string>1</string>
PLIST
    if [ -n "${LANG:-}" ]; then
      printf '    <key>LANG</key>\n    <string>%s</string>\n' "$(xml_escape "$LANG")"
    fi
    cat <<PLIST
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$LOG_FILE")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$LOG_FILE")</string>
</dict>
</plist>
PLIST
  } > "$PLIST"
  chmod 644 "$PLIST"

  # gui/<uid> only exists with a logged-in session. Via SSH without a login at the screen, user/<uid> remains.
  DOMAIN="gui/$(id -u)"
  launchctl print "$DOMAIN" >/dev/null 2>&1 || DOMAIN="user/$(id -u)"

  # Unload a running agent first. bootout returns before it is completely gone.
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  for _ in $(seq 1 20); do
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
    sleep 0.5
  done
  launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST" || fail "launchctl could not load $PLIST. Log in at the Mac's screen once and run this again."
}

service_running() {
  if [ "$OS" = linux ]; then
    systemctl --user is-active --quiet device-mcp.service
  else
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -q 'state = running'
  fi
}

if [ "$OS" = linux ]; then setup_systemd; else setup_launchd; fi

# --- Uninstaller -----------------------------------------------------------

curl -fsSL "$SERVER_URL/uninstall.sh" -o "$UNINSTALL_BIN" && chmod 755 "$UNINSTALL_BIN" \
  || warn "Could not download the uninstaller. You can also uninstall with: curl -fsSL $SERVER_URL/uninstall.sh | bash"

# --- Check -----------------------------------------------------------------

sleep 2
if [ "$OS" = linux ]; then
  LOG_HINT="journalctl --user -u device-mcp -n 50"
else
  LOG_HINT="tail -n 50 $LOG_FILE"
fi
if service_running; then
  bold "Done. The daemon is running."
else
  warn "The service is not running. Check the log: $LOG_HINT"
fi

echo
if [ "$OS" = linux ]; then
  echo "  Status:    systemctl --user status device-mcp"
  echo "  Log:       journalctl --user -u device-mcp -f"
  echo "  Restart:   systemctl --user restart device-mcp"
else
  echo "  Status:    launchctl print $DOMAIN/$LABEL"
  echo "  Log:       tail -f $LOG_FILE"
  echo "  Restart:   launchctl kickstart -k $DOMAIN/$LABEL"
fi
echo "  Uninstall: device-mcp-uninstall   (or: curl -fsSL $SERVER_URL/uninstall.sh | bash)"
echo

echo "Updates: when the server ships a newer daemon, the panel shows an Update button for this device."
echo "Turn on auto-update there if the device should always follow the server."
if [ "$OS" = darwin ]; then
  echo "On macOS the daemon runs while you are logged in. If Claude gets 'Operation not permitted' in Desktop, Documents or"
  echo "Downloads, allow $BIN under System Settings > Privacy & Security > Full Disk Access."
fi
echo "The device should now be online in the panel."
