#!/usr/bin/env bash
# device-mcp: Daemon installieren oder aktualisieren (Linux, systemd).
#
#   curl -fsSL __SERVER_URL__/install.sh | DEVICE_MCP_TOKEN='dmcp_…' bash
#
# Erneut ausführen aktualisiert das Binary. Ohne DEVICE_MCP_TOKEN bleibt der Token aus der bestehenden Config.
# Der Daemon läuft als der Benutzer, der dieses Script ausführt, nicht als root.
set -euo pipefail

SERVER_URL="${DEVICE_MCP_SERVER:-__SERVER_URL__}"
SERVER_URL="${SERVER_URL%/}"
TOKEN="${DEVICE_MCP_TOKEN:-}"

BIN_DIR="$HOME/.local/bin"
BIN="$BIN_DIR/device-mcp"
UNINSTALL_BIN="$BIN_DIR/device-mcp-uninstall"
# Fester Ort, den auch die Unit-Datei (%h/.config) und der Daemon ohne XDG-Variablen finden.
CONFIG_HOME="$HOME/.config"
CONFIG_DIR="$CONFIG_HOME/device-mcp"
CONFIG="$CONFIG_DIR/config.json"
ENV_FILE="$CONFIG_DIR/env"
UNIT_DIR="$CONFIG_HOME/systemd/user"
UNIT="$UNIT_DIR/device-mcp.service"
TOOLS_DIR="$HOME/.claude-tools"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mNote:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Voraussetzungen -------------------------------------------------------

[ "$(uname -s)" = "Linux" ] || fail "The daemon only runs on Linux for now."
if [ "$(id -u)" = "0" ] && [ "${DEVICE_MCP_ALLOW_ROOT:-}" != "1" ]; then
  fail "Please run as a normal user, not as root (the daemon runs as this user). To do it anyway: DEVICE_MCP_ALLOW_ROOT=1."
fi
command -v curl >/dev/null || fail "curl is missing."
command -v gzip >/dev/null || fail "gzip is missing."
command -v systemctl >/dev/null || fail "systemd is missing (systemctl not found)."
command -v bash >/dev/null || fail "bash is missing."
case "$SERVER_URL" in
  http://*|https://*) ;;
  *) fail "Server URL '$SERVER_URL' is invalid. Set DEVICE_MCP_SERVER=https://…" ;;
esac
case "$SERVER_URL" in *'"'*|*'\'*) fail "Server URL contains invalid characters." ;; esac

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) fail "Architecture $(uname -m) is not supported (only x86_64 and aarch64)." ;;
esac

if [ -z "$TOKEN" ] && [ -f "$CONFIG" ]; then
  TOKEN="$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG" | head -n1)"
  [ -n "$TOKEN" ] && step "Keeping the token from $CONFIG"
fi
[ -n "$TOKEN" ] || fail "No device token. Usage: curl -fsSL $SERVER_URL/install.sh | DEVICE_MCP_TOKEN='dmcp_…' bash"
case "$TOKEN" in
  *[!A-Za-z0-9_-]*) fail "The token contains invalid characters. Copy it again from the panel." ;;
esac

# systemctl --user braucht die Laufzeitumgebung der Benutzersitzung, auch per SSH oder su.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

bold "Setting up device-mcp for $(id -un)@$(hostname) ($ARCH), server $SERVER_URL"

# --- Binary ----------------------------------------------------------------

step "Downloading the daemon"
mkdir -p "$BIN_DIR"
TMP_BIN="$(mktemp "$BIN_DIR/.device-mcp.XXXXXX")"
trap 'rm -f "$TMP_BIN"' EXIT
curl -fSL --progress-bar "$SERVER_URL/download/device-mcp-linux-$ARCH.gz" | gzip -dc > "$TMP_BIN" \
  || fail "Download of $SERVER_URL/download/device-mcp-linux-$ARCH.gz failed."
chmod 755 "$TMP_BIN"
"$TMP_BIN" --version >/dev/null 2>&1 || fail "The downloaded binary does not run on this system."
# mv ersetzt die Datei atomar, ein laufender Daemon behält bis zum Neustart die alte Version.
mv -f "$TMP_BIN" "$BIN"
trap - EXIT
step "Daemon $("$BIN" --version) at $BIN"

# --- Konfiguration ---------------------------------------------------------

step "Writing $CONFIG"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
(
  umask 077
  printf '{\n  "serverUrl": "%s",\n  "token": "%s"\n}\n' "$SERVER_URL" "$TOKEN" > "$CONFIG"
)
chmod 600 "$CONFIG"

# Der Service bekommt den PATH dieser Shell, damit Claude dieselben Programme findet wie du (nvm, ~/.local/bin, …).
(
  umask 077
  {
    echo "# Written by install.sh. Environment for the device-mcp service."
    printf 'PATH=%s\n' "$BIN_DIR:$PATH"
    [ -n "${LANG:-}" ] && printf 'LANG=%s\n' "$LANG"
  } > "$ENV_FILE"
)

# --- ~/.claude-tools -------------------------------------------------------

mkdir -p "$TOOLS_DIR"
if [ ! -f "$TOOLS_DIR/README.md" ]; then
  step "Creating $TOOLS_DIR/README.md"
  cat > "$TOOLS_DIR/README.md" <<README
# Claude tools on $(hostname)

Helper scripts Claude has built on this device. Before Claude builds something new,
it reads this file. Every new script goes into this directory and gets an entry here.

- User: $(id -un)
- System: $( (. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-Linux}") || echo Linux ), $(uname -m)
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

# --- systemd-User-Service --------------------------------------------------

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
Restart=always
RestartSec=5
# Jobs laufen in eigenen Prozessgruppen, beim Stoppen sollen sie mit enden.
KillMode=control-group
TimeoutStopSec=15

[Install]
WantedBy=default.target
UNIT

# Damit der Daemon nach einem Reboot ohne Anmeldung startet.
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

# Nach enable-linger startet systemd den User-Manager, das kann einen Moment dauern.
for _ in $(seq 1 20); do
  [ -S "$XDG_RUNTIME_DIR/bus" ] && break
  sleep 0.5
done
systemctl --user daemon-reload || fail "systemctl --user does not work. Is a user session running? Log in via 'ssh' instead of 'su' if needed."
systemctl --user enable device-mcp.service >/dev/null
systemctl --user restart device-mcp.service

# --- Uninstaller -----------------------------------------------------------

curl -fsSL "$SERVER_URL/uninstall.sh" -o "$UNINSTALL_BIN" && chmod 755 "$UNINSTALL_BIN" \
  || warn "Could not download the uninstaller. You can also uninstall with: curl -fsSL $SERVER_URL/uninstall.sh | bash"

# --- Kontrolle -------------------------------------------------------------

sleep 2
if systemctl --user is-active --quiet device-mcp.service; then
  bold "Done. The daemon is running."
else
  warn "The service is not running. Check the log: journalctl --user -u device-mcp -n 50"
fi
cat <<EOF

  Status:    systemctl --user status device-mcp
  Log:       journalctl --user -u device-mcp -f
  Restart:   systemctl --user restart device-mcp
  Uninstall: device-mcp-uninstall   (or: curl -fsSL $SERVER_URL/uninstall.sh | bash)

The device should now be online in the panel.
EOF
