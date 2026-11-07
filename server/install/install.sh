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
warn() { printf '\033[1;33mHinweis:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Voraussetzungen -------------------------------------------------------

[ "$(uname -s)" = "Linux" ] || fail "Der Daemon läuft vorerst nur unter Linux."
if [ "$(id -u)" = "0" ] && [ "${DEVICE_MCP_ALLOW_ROOT:-}" != "1" ]; then
  fail "Bitte als normaler Benutzer ausführen, nicht als root (der Daemon läuft als dieser Benutzer). Wer es trotzdem will: DEVICE_MCP_ALLOW_ROOT=1."
fi
command -v curl >/dev/null || fail "curl fehlt."
command -v gzip >/dev/null || fail "gzip fehlt."
command -v systemctl >/dev/null || fail "systemd fehlt (systemctl nicht gefunden)."
command -v bash >/dev/null || fail "bash fehlt."
case "$SERVER_URL" in
  http://*|https://*) ;;
  *) fail "Server-URL '$SERVER_URL' ist ungültig. Setze DEVICE_MCP_SERVER=https://…" ;;
esac
case "$SERVER_URL" in *'"'*|*'\'*) fail "Server-URL enthält ungültige Zeichen." ;; esac

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) fail "Architektur $(uname -m) wird nicht unterstützt (nur x86_64 und aarch64)." ;;
esac

if [ -z "$TOKEN" ] && [ -f "$CONFIG" ]; then
  TOKEN="$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG" | head -n1)"
  [ -n "$TOKEN" ] && step "Behalte den Token aus $CONFIG"
fi
[ -n "$TOKEN" ] || fail "Kein Geräte-Token. Aufruf: curl -fsSL $SERVER_URL/install.sh | DEVICE_MCP_TOKEN='dmcp_…' bash"
case "$TOKEN" in
  *[!A-Za-z0-9_-]*) fail "Der Token enthält ungültige Zeichen. Kopiere ihn erneut aus dem Panel." ;;
esac

# systemctl --user braucht die Laufzeitumgebung der Benutzersitzung, auch per SSH oder su.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

bold "device-mcp für $(id -un)@$(hostname) ($ARCH) einrichten, Server $SERVER_URL"

# --- Binary ----------------------------------------------------------------

step "Lade den Daemon"
mkdir -p "$BIN_DIR"
TMP_BIN="$(mktemp "$BIN_DIR/.device-mcp.XXXXXX")"
trap 'rm -f "$TMP_BIN"' EXIT
curl -fSL --progress-bar "$SERVER_URL/download/device-mcp-linux-$ARCH.gz" | gzip -dc > "$TMP_BIN" \
  || fail "Download von $SERVER_URL/download/device-mcp-linux-$ARCH.gz fehlgeschlagen."
chmod 755 "$TMP_BIN"
"$TMP_BIN" --version >/dev/null 2>&1 || fail "Das geladene Binary startet nicht auf diesem System."
# mv ersetzt die Datei atomar, ein laufender Daemon behält bis zum Neustart die alte Version.
mv -f "$TMP_BIN" "$BIN"
trap - EXIT
step "Daemon $("$BIN" --version) in $BIN"

# --- Konfiguration ---------------------------------------------------------

step "Schreibe $CONFIG"
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
    echo "# Von install.sh geschrieben. Umgebung für den device-mcp-Service."
    printf 'PATH=%s\n' "$BIN_DIR:$PATH"
    [ -n "${LANG:-}" ] && printf 'LANG=%s\n' "$LANG"
  } > "$ENV_FILE"
)

# --- ~/.claude-tools -------------------------------------------------------

mkdir -p "$TOOLS_DIR"
if [ ! -f "$TOOLS_DIR/README.md" ]; then
  step "Lege $TOOLS_DIR/README.md an"
  cat > "$TOOLS_DIR/README.md" <<README
# Claude-Tools auf $(hostname)

Helfer-Scripts, die Claude auf diesem Gerät gebaut hat. Bevor Claude etwas Neues baut,
liest es diese Datei. Jedes neue Script kommt in diesen Ordner und bekommt hier einen Eintrag.

- Benutzer: $(id -un)
- System: $( (. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-Linux}") || echo Linux ), $(uname -m)
- Angelegt: $(date -u +%Y-%m-%d)

## Scripts

| Script | Zweck | Aufruf |
|---|---|---|
| – | Noch keine Scripts. | – |

## Notizen

Hinweise zum Gerät, die Claude beim nächsten Mal wissen sollte (Pfade, Dienste, Eigenheiten).
README
else
  step "$TOOLS_DIR/README.md gibt es schon, bleibt unverändert"
fi

# --- systemd-User-Service --------------------------------------------------

step "Richte den systemd-User-Service ein"
mkdir -p "$UNIT_DIR"
cat > "$UNIT" <<'UNIT'
[Unit]
Description=device-mcp Daemon (Befehle und Dateien für Claude)
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
  step "Aktiviere Linger für $(id -un)"
  if ! loginctl enable-linger "$(id -un)" 2>/dev/null; then
    if command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
      sudo loginctl enable-linger "$(id -un)"
    elif command -v sudo >/dev/null && [ -r /dev/tty ]; then
      echo "Für 'loginctl enable-linger' wird einmal dein sudo-Passwort gebraucht."
      sudo loginctl enable-linger "$(id -un)" < /dev/tty || warn "Linger nicht aktiviert. Nach einem Reboot startet der Daemon erst bei deiner Anmeldung. Nachholen: sudo loginctl enable-linger $(id -un)"
    else
      warn "Linger nicht aktiviert. Nach einem Reboot startet der Daemon erst bei deiner Anmeldung. Nachholen: sudo loginctl enable-linger $(id -un)"
    fi
  fi
fi

# Nach enable-linger startet systemd den User-Manager, das kann einen Moment dauern.
for _ in $(seq 1 20); do
  [ -S "$XDG_RUNTIME_DIR/bus" ] && break
  sleep 0.5
done
systemctl --user daemon-reload || fail "systemctl --user geht nicht. Läuft eine Benutzersitzung? Ggf. per 'ssh' statt 'su' anmelden."
systemctl --user enable device-mcp.service >/dev/null
systemctl --user restart device-mcp.service

# --- Uninstaller -----------------------------------------------------------

curl -fsSL "$SERVER_URL/uninstall.sh" -o "$UNINSTALL_BIN" && chmod 755 "$UNINSTALL_BIN" \
  || warn "Uninstaller nicht geladen. Deinstallieren geht auch mit: curl -fsSL $SERVER_URL/uninstall.sh | bash"

# --- Kontrolle -------------------------------------------------------------

sleep 2
if systemctl --user is-active --quiet device-mcp.service; then
  bold "Fertig. Der Daemon läuft."
else
  warn "Der Service läuft nicht. Log ansehen: journalctl --user -u device-mcp -n 50"
fi
cat <<EOF

  Status:        systemctl --user status device-mcp
  Log:           journalctl --user -u device-mcp -f
  Neu starten:   systemctl --user restart device-mcp
  Deinstallieren: device-mcp-uninstall   (oder: curl -fsSL $SERVER_URL/uninstall.sh | bash)

Im Panel sollte das Gerät jetzt online sein.
EOF
