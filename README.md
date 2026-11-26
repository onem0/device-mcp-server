# device-mcp-server

Ein selbst gehosteter MCP-Server, über den Claude (claude.ai, Claude-App, Claude Code) auf deinen eigenen Geräten (Linux und macOS) Befehle ausführt und Dateien liest und schreibt. Nur für dich, kein Multi-User.

```
 claude.ai / App / Claude Code
            │  HTTPS  POST /mcp   Authorization: Bearer <MCP_TOKEN>
            ▼
 ┌──────────────────────────────┐        ┌───────────┐
 │ server  (Fastify, Coolify)   │◄──────►│ Postgres  │  Geräte, Token-Hashes, Jobs, Audit-Log
 │  /mcp   /v1 (Panel-API)  /   │        └───────────┘
 │  /daemon/ws   /install.sh    │
 └──────────────▲───────────────┘
                │  wss, vom Gerät aus aufgebaut (keine offenen Ports auf den Geräten)
     ┌──────────┴──────────┐
  daemon (Raspi)      daemon (Mac) …      systemd-User-Service bzw. launchd-Agent, läuft als dein Benutzer
```

Zwei Repos:

| Repo | Inhalt |
|---|---|
| [device-mcp-server](https://github.com/onem0/device-mcp-server) (dieses) | Server, Web-Panel, Installer, Compose für Coolify |
| [device-mcp-client](https://github.com/onem0/device-mcp-client) | Daemon für die Geräte, hier als Submodule `daemon/` eingebunden |

| Ordner | Inhalt |
|---|---|
| `server/` | Fastify-Server (TypeScript): MCP-Endpoint, Panel-API, WebSocket für die Daemons, Installer. Drizzle + Postgres. |
| `server/panel/` | Web-Panel, Nuxt-SPA (`ssr: false`), wird vom Server ausgeliefert. |
| `server/install/` | `install.sh` und `uninstall.sh`, der Server liefert sie aus. |
| `daemon/` | Submodule auf device-mcp-client. Das Docker-Image baut daraus mit `bun build --compile` die Binaries für Linux und macOS (jeweils x64 und arm64) und ein `manifest.json` mit Version und Prüfsummen. |
| `docker-compose.yml` | Server + Postgres für Coolify. |

Klonen mit Submodule:

```bash
git clone --recurse-submodules https://github.com/onem0/device-mcp-server.git
# oder nachträglich: git submodule update --init
```

Das Submodule hat eine relative URL (`../device-mcp-client.git`). Dadurch klont Coolify es mit demselben Zugang wie das Server-Repo.

## Deployment auf Coolify

Aktuell läuft der Server auf Coolify (Server „Contabo“, Projekt „Private“) unter https://device.onemo.dev. Die Domain geht über Cloudflare (Proxy an).

1. In Coolify: **New Resource → Private Repository (GitHub App)** mit `onem0/device-mcp-server`, Branch `main`, Build Pack **Docker Compose**.
   - Base Directory: `/`
   - Docker Compose Location: `/docker-compose.yml`
   - Git Submodules müssen aktiv sein (Standard). Die GitHub-App braucht Zugriff auf beide Repos.
2. Unter **Environment Variables** die Werte aus `.env.example` setzen. Zum Erzeugen: `openssl rand -hex 32`.

   | Variable | Pflicht | Bedeutung |
   |---|---|---|
   | `PUBLIC_URL` | ja | Öffentliche Adresse, z. B. `https://device.onemo.dev` (ohne `/` am Ende) |
   | `MCP_TOKEN` | ja | Token für `/mcp`, mindestens 32 Zeichen |
   | `PANEL_PASSWORD` | ja | Passwort fürs Web-Panel, mindestens 12 Zeichen |
   | `POSTGRES_PASSWORD` | ja | Nur Buchstaben und Ziffern (steht in einer URL), z. B. `openssl rand -hex 24` |
   | `POSTGRES_USER`, `POSTGRES_DB` | nein | Standard `devicemcp` |
   | `SESSION_TTL_HOURS` | nein | Panel-Sitzung, Standard 168 (verlängert sich bei Nutzung) |
   | `HEARTBEAT_INTERVAL_SECONDS` / `HEARTBEAT_TIMEOUT_SECONDS` | nein | Standard 15 / 45 |
   | `SESSION_MAX_DAYS` | nein | Spätestens nach so vielen Tagen neu anmelden, Standard 30 |
   | `TRUST_PROXY` | nein | Anzahl Proxy-Hops, denen die Client-IP geglaubt wird. Standard `1` (Traefik), hinter Cloudflare `2` |
   | `LOG_LEVEL` | nein | Standard `info` |

3. Beim Service **server** die Domain eintragen, mit dem Container-Port: `https://device.onemo.dev:3000`. Coolify erzeugt daraus die Traefik-Labels samt Let's-Encrypt-Zertifikat; der Port wird nicht öffentlich, er sagt Traefik nur, wohin es weiterleiten soll. Die Domain muss zu `PUBLIC_URL` passen.
4. **Deploy.** Der erste Build dauert ein paar Minuten (Bun lädt die Runtimes für x64 und arm64). Der Server führt beim Start die Datenbank-Migrationen aus; der Healthcheck läuft über `/healthz`.

WebSockets brauchen keine Extra-Einstellung: Traefik und Cloudflare reichen das Upgrade auf `/daemon/ws` durch. Die Daemons schicken alle 15 s einen Heartbeat, Idle-Timeouts greifen deshalb nicht. Postgres hat keinen öffentlichen Port und läuft nur im internen Compose-Netz.

`/mcp` antwortet als SSE-Stream und schickt dabei alle 15 s einen Keepalive. Sonst würde Cloudflare lange `run_command`-Aufrufe nach 100 s ohne Daten mit 524 abbrechen.

Neu ausrollen: auf `main` pushen. Coolify deployt über den Webhook der GitHub-App automatisch. Beim Container-Wechsel sind Server und MCP etwa eine Minute weg; die Daemons verbinden sich danach von selbst wieder, laufende Jobs auf den Geräten laufen weiter.

**Danach prüfen:** `https://device.onemo.dev/healthz` antwortet `{"ok":true}`, und ohne Token liefert `curl -i -X POST https://device.onemo.dev/mcp` nur `401`.

## Gerät hinzufügen

1. Im Panel (`https://device.onemo.dev`) anmelden und **Gerät hinzufügen** wählen. Der Name ist der, mit dem du das Gerät in Claude ansprichst (z. B. `raspi-garten`).
2. Das Panel bietet den fertigen Install-Befehl **genau einmal** zum Kopieren an. Der Geräte-Token steckt im kopierten Befehl, auf dem Bildschirm ist er verdeckt. In der Datenbank liegt nur sein SHA-256-Hash.
3. Den Befehl auf dem Gerät als normaler Benutzer ausführen (nicht als root):

   ```bash
   curl -fsSL https://device.onemo.dev/install.sh | DEVICE_MCP_TOKEN='dmcp_…' bash
   ```

   Das Script kommt vom Server und holt auch den Daemon von dort: Es lädt das passende Binary, trägt genau diesen Server in `~/.config/device-mcp/config.json` ein (chmod 600), legt `~/.claude-tools/README.md` an (falls es sie noch nicht gibt) und richtet den Daemon als Service ein.
   - **Linux:** systemd-User-Service `device-mcp` mit `Restart=always`, dazu `loginctl enable-linger`, damit der Daemon nach einem Reboot ohne Anmeldung startet. Falls Linger Root-Rechte braucht, fragt das Script einmal nach dem sudo-Passwort.
   - **macOS:** LaunchAgent `dev.onemo.device-mcp` (`~/Library/LaunchAgents/`), Log in `~/Library/Logs/device-mcp.log`. Er läuft, solange du angemeldet bist.
4. Im Dialog springt die Anzeige auf **Verbunden**, sobald sich der Daemon meldet.

Voraussetzungen auf dem Gerät: Linux mit systemd oder macOS, x86_64 oder arm64, `curl` und `gzip`. Eine Runtime ist nicht nötig. Die Befehlsform ohne Token steht auch im Panel unter „Connection“.

macOS schützt Schreibtisch, Dokumente und Downloads: Meldet Claude dort „Operation not permitted“, `~/.local/bin/device-mcp` unter Systemeinstellungen → Datenschutz & Sicherheit → Festplattenvollzugriff erlauben. Das Binary ist ad hoc signiert, nach einem Update kann macOS die Freigabe erneut verlangen.

### Im Panel

- **Umbenennen:** sofort wirksam, Claude nutzt danach den neuen Namen.
- **Deaktivieren:** trennt die Verbindung sofort, Claude erreicht das Gerät nicht mehr. Nach dem Aktivieren verbindet sich der Daemon innerhalb einer Minute wieder (oder sofort mit `systemctl --user restart device-mcp`).
- **Token neu:** Der alte Token gilt sofort nicht mehr. Den neuen Install-Befehl auf dem Gerät ausführen, das tauscht nur die Konfiguration.
- **Nur lesen:** Claude kann auf dem Gerät weiter lesen (Dateien, Jobs, Session-Bildschirme), aber keine Befehle ausführen, nichts schreiben oder ändern und nichts in Sessions tippen. `kill_job` und `session_kill` bleiben erlaubt, damit sich Laufendes stoppen lässt. Wirkt sofort, ohne Neuverbindung.
- **Löschen:** entfernt das Gerät mit Jobs und Audit-Log.
- **Protokoll:** jeder MCP-Aufruf mit Zeitpunkt, Gerät, Tool, gekürzten Argumenten, Ergebnis, Exit-Code und Dauer. Über alle Geräte auf der Seite „Protokoll“ (mit Gerätefilter), pro Gerät auf dessen Seite. Lange Argumente sind auf 200 Zeichen gekürzt, Dateiinhalte stehen nur als Länge drin.

### Auf dem Gerät

```bash
systemctl --user status device-mcp      # Status
journalctl --user -u device-mcp -f      # Log
systemctl --user restart device-mcp     # Neustart
curl -fsSL https://device.onemo.dev/install.sh | bash   # Binary und Service neu einrichten, behält den Token
device-mcp-uninstall                    # Deinstallieren (oder: curl -fsSL https://device.onemo.dev/uninstall.sh | bash)
```

Unter macOS statt der ersten drei Zeilen:

```bash
launchctl print gui/$(id -u)/dev.onemo.device-mcp          # Status
tail -f ~/Library/Logs/device-mcp.log                      # Log
launchctl kickstart -k gui/$(id -u)/dev.onemo.device-mcp   # Neustart
```

Der Uninstaller entfernt Service, Binary, Konfiguration, Job-Logs und die `mcp-`-tmux-Sessions. `~/.claude-tools` bleibt stehen, unter Linux ebenso Linger (das kann auch andere Dienste betreffen). Danach das Gerät im Panel löschen.

### Daemon updaten

Ab Version 0.3.0 aktualisiert sich der Daemon selbst. Der Server liefert unter `/download/manifest.json` die Version und die SHA-256-Prüfsummen seiner Daemon-Binaries aus. Der Daemon fragt das nach jedem Verbindungsaufbau ab (also kurz nach jedem Deploy, denn dabei startet der Server neu) und zusätzlich alle sechs Stunden. Ist die Version dort neuer als seine eigene, dann

1. lädt er sein Binary vom Server, entpackt es und prüft Größe und Prüfsumme,
2. startet das neue Binary probeweise mit `--version`,
3. ersetzt sich selbst (`rename`, atomar) und
4. beendet sich, sobald kein Job mehr läuft. systemd bzw. launchd startet dann das neue Binary. tmux-Sessions laufen dabei weiter.

Schlägt ein Schritt fehl, bleibt die alte Version in Betrieb, und dieselbe Version wird frühestens nach einer Stunde erneut versucht. Im Panel steht unter „Daemon“ neben der Version „Updates itself to …“, solange ein Update aussteht. Ein Downgrade gibt es nicht: Liefert der Server eine ältere Version aus, bleibt der Daemon, wie er ist.

Abschalten pro Gerät: `"autoUpdate": false` in `~/.config/device-mcp/config.json`, oder beim Installieren `curl … | DEVICE_MCP_AUTO_UPDATE=0 bash` (mit `=1` wieder an). Aktualisiert wird nur das Binary. Ändert sich einmal die Service-Definition, das Install-Script erneut ausführen.

**Daemons vor 0.3.0** können das noch nicht und brauchen das Update ein letztes Mal von Hand; das Panel zeigt bei ihnen „Needs a manual update“ mit dem Befehl. Ruft Claude ein Tool auf, das ein Daemon noch nicht kennt, kommt „Daemon-Version zu alt“ mit dem passenden Hinweis.

Auf dem Gerät (per SSH):

```bash
curl -fsSL https://device.onemo.dev/install.sh | bash   # holt das neue Binary, behält Token und Config, startet den Service neu
```

Oder Claude erledigt es selbst per `run_command` (Linux). Wichtig ist `systemd-run`: Das Update startet den Daemon neu, und ohne eigene Unit würde der Neustart das laufende Update mit beenden.

```bash
systemd-run --user --collect bash -c 'curl -fsSL https://device.onemo.dev/install.sh | bash'
```

Der Befehl kehrt sofort zurück. Nach etwa 20 Sekunden ist das Gerät mit der neuen Version wieder online (`list_devices` bzw. Panel).

| Pfad auf dem Gerät | Inhalt |
|---|---|
| `~/.local/bin/device-mcp` | Daemon |
| `~/.config/device-mcp/config.json` | Server-URL, Geräte-Token und `autoUpdate` (chmod 600) |
| `~/.config/device-mcp/env` | Linux: PATH aus deiner Shell beim Installieren, damit Claude dieselben Programme findet (unter macOS steht er in der plist) |
| `~/.config/systemd/user/device-mcp.service` | Linux: systemd-Unit |
| `~/Library/LaunchAgents/dev.onemo.device-mcp.plist` | macOS: LaunchAgent |
| `~/Library/Logs/device-mcp.log` | macOS: Log des Daemons |
| `~/.local/state/device-mcp/jobs/` | Job-Status und Ausgabe (die letzten 300 Jobs, höchstens 14 Tage) |
| `~/.local/state/device-mcp/update.json` | Nur nach einem fehlgeschlagenen Update: Version, Zeitpunkt, Fehler |
| `~/.claude-tools/` | Helfer-Scripts von Claude, mit README |

## Connector in claude.ai eintragen

1. claude.ai → Einstellungen → **Connectors** → **Custom Connector hinzufügen**.
2. URL: `https://device.onemo.dev/mcp`
3. Request-Header anlegen:
   - Name: `Authorization`
   - Wert: `Bearer <MCP_TOKEN>`
4. Speichern. Der Connector steht danach auch in der Claude-App auf dem Handy zur Verfügung.

## Einbinden in Claude Code

```bash
export MCP_TOKEN='…'   # aus der .env des Servers
claude mcp add --transport http --scope user device-mcp https://device.onemo.dev/mcp \
  --header "Authorization: Bearer $MCP_TOKEN"
```

`--scope user` macht den Server in allen Projekten verfügbar; ohne gilt er nur im aktuellen Ordner. Prüfen mit `claude mcp list`.

## MCP-Tools

Alle Tools außer `list_devices` bekommen `device` (Name oder ID).

| Tool | Hinweise | Annotation |
|---|---|---|
| `list_devices` | Name, online/offline, OS, Architektur, Benutzer, zuletzt gesehen | readOnly |
| `run_command` | `command`, optional `cwd`, `timeout` (Sekunden), `background`. Läuft über `bash -c` als dein Benutzer, ohne TTY. Vordergrund: Standard 120 s, höchstens 600 s; die Ausgabe zeigt die ersten und letzten 200 Zeilen und wie viel dazwischen fehlt. `background=true` liefert sofort eine `job_id`. | destructive |
| `job_status` | Status, Exit-Code, Laufzeit, Ausgabeumfang. Ohne `job_id`: die letzten 20 Jobs | readOnly |
| `job_output` | `offset`/`limit` (Zeilen) oder `tail`, auch während der Job läuft | readOnly |
| `kill_job` | SIGTERM an die ganze Prozessgruppe, nach 5 s SIGKILL | destructive |
| `job_wait` | Wartet bis zu `timeout` s (Standard 120, höchstens 600), bis der Job fertig ist. Liefert Status, Exit-Code und die letzten 50 Zeilen | readOnly |
| `read_file` | Text mit `offset`/`limit`; PNG, JPEG, GIF und WebP als MCP-Bild (höchstens 3,75 MB); andere Binärdateien werden nur beschrieben. Mit `encoding=base64` die Rohdaten jeder Datei in Stücken (`byte_offset`, `byte_length`, Standard 256 KB, höchstens 1 MB pro Aufruf) | readOnly |
| `write_file` | `mode` overwrite oder append, legt fehlende Ordner an, `encoding` utf8 oder base64, höchstens 10 MB | destructive |
| `edit_file` | Ersetzt `old_string` durch `new_string`; Fehler mit Trefferzahl bei 0 oder (ohne `replace_all`) mehreren Treffern. Schreibt atomar (Temp-Datei + rename), behält Rechte und LF/CRLF, folgt Symlinks. Antwortet mit ein paar Zeilen Kontext | destructive |
| `session_start` | Startet eine tmux-Session `mcp-<name>` (Standard: Login-Shell) mit `cwd`, `command`, `cols`, `rows`. Übersteht Neustarts des Daemons. Auf dem Gerät mit `tmux attach -t mcp-<name>` zuschauen | destructive |
| `session_send` | `text` wird wörtlich getippt, danach `keys` (Enter, C-c, Up, Tab …). Wartet `wait_ms` (Standard 500) und liefert gleich den Bildschirm | destructive |
| `session_read` | Bildschirm als reiner Text (`capture-pane -p -J`), ohne Farbcodes, leere Zeilen am Ende abgeschnitten; `scrollback_lines` für Verlauf. Bei beendetem Befehl mit Exit-Code | readOnly |
| `session_list` | Die `mcp-`-Sessions mit Programm, Größe und Status | readOnly |
| `session_kill` | Beendet die Session samt Programmen | destructive |

Neu ab Daemon 0.2.0: `edit_file`, die Session-Tools und `read_file` mit base64; `job_wait` geht auch mit älteren Daemons. Für Sessions braucht das Gerät tmux (`sudo apt install tmux`); fehlt es, sagt das Tool das. Damit Sessions einen Neustart des Daemons überleben, startet der Daemon tmux über `systemd-run --user --scope` außerhalb seiner eigenen Cgroup.

Die Server-Instructions weisen Claude auf `~/.claude-tools/README.md` hin: erst lesen, neue Helfer-Scripts dort ablegen und eintragen.

Jobs überleben Verbindungsabbrüche: Der Daemon schreibt die Ausgabe auf die Platte und meldet nach dem Reconnect den Stand aller Jobs, der Server gleicht Datenbank und Audit-Log ab. Ein Neustart des Daemons beendet laufende Jobs (sie stehen dann als `lost` im Log).

## Sicherheit

- Wer den `MCP_TOKEN` hat, kann auf allen verbundenen Geräten Befehle ausführen. Behandle ihn wie einen SSH-Schlüssel ohne Passphrase. Der Vergleich läuft in konstanter Zeit, Fehler geben nur `401` ohne Details zurück.
- Das Panel zeigt den MCP-Token nie an. Mit dem Panel-Passwort lassen sich Geräte verwalten, aber keine Befehle ausführen.
- Geräte-Tokens und Panel-Sitzungen liegen nur als SHA-256-Hash in der Datenbank. Der Login ist auf 10 Versuche pro 15 Minuten und IP begrenzt, ab 30 Fehlversuchen pro 15 Minuten insgesamt wird höchstens ein Passwort pro Sekunde geprüft, egal von welcher IP. Das Cookie ist `HttpOnly`, `Secure` und `SameSite=Strict`.
- Panel-Sitzungen verlängern sich bei Nutzung, enden aber spätestens nach `SESSION_MAX_DAYS`. Ein neues `PANEL_PASSWORD` meldet alle Sitzungen ab.
- „Token neu“, Deaktivieren und Löschen trennen das Gerät sofort, auch wenn es sich im selben Moment verbindet.
- Der Daemon läuft als normaler Benutzer. Was Claude darf, ist genau das, was dieser Benutzer darf. Hat der Benutzer passwortloses sudo (wie auf dem Pi), heißt Zugriff auf `/mcp` Root auf dem Gerät.
- „Nur lesen“ pro Gerät sperrt `run_command`, `write_file`, `edit_file`, `session_start` und `session_send` auf dem Server, bevor etwas zum Gerät geht.
- Jeder MCP-Aufruf landet im Audit-Log, auch abgelehnte. Tokens landen weder dort noch im Server-Log: Der Logger schwärzt `authorization`- und `cookie`-Header, und der Request-Kontext des SDK wird aus den protokollierten Argumenten herausgefiltert.
- Der Daemon baut die Verbindung selbst auf, auf den Geräten ist kein Port offen.
- Auto-Update: Der Daemon lädt neue Versionen nur von dem Server, mit dem er verbunden ist, über dieselbe TLS-Verbindung wie alles andere. Die Prüfsumme im Manifest schützt vor abgebrochenen oder beschädigten Downloads, nicht vor einem übernommenen Server; der kann ohnehin Befehle auf den Geräten ausführen. Installer, Manifest und Binaries sind öffentlich abrufbar und enthalten keine Geheimnisse.

## Lokal entwickeln und testen

Voraussetzungen: Node 24, pnpm 10, Bun, Docker.

```bash
git submodule update --init          # daemon/
pnpm install
cp .env.example .env                 # Werte setzen, dazu DATABASE_URL für localhost:5433
pnpm db:up                           # Postgres auf :5433
pnpm build:panel                     # Panel bauen, der Server liefert es aus
PORT=3100 pnpm dev:server            # Server auf :3100, API-Doku unter /docs
```

Daemon gegen den lokalen Server, ohne Installation (Details im README von device-mcp-client):

```bash
cd daemon && bun install
printf '{"serverUrl":"http://127.0.0.1:3100","token":"dmcp_…"}' > /tmp/dmcp.json && chmod 600 /tmp/dmcp.json
DEVICE_MCP_CONFIG=/tmp/dmcp.json DEVICE_MCP_STATE_DIR=/tmp/dmcp-state bun run src/index.ts
bun run build                        # Binaries nach daemon/dist (Linux und macOS, x64 und arm64, jeweils auch .gz) plus manifest.json
```

Der ganze Stack wie auf Coolify, mit Ports auf dem Rechner:

```bash
docker compose -f docker-compose.yml -f compose.local.yml up -d --build   # http://localhost:3000
```

Tests:

```bash
pnpm --filter server test            # Server: Versionsprüfung, Read-only-Liste, Audit-Argumente
cd daemon && bun test                # Daemon: edit_file und tmux-Sessions (braucht tmux)
```

Tools durchprobieren mit dem MCP Inspector:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --transport http \
  --header "Authorization: Bearer $MCP_TOKEN" --method tools/call \
  --tool-name run_command --tool-args-json '{"device":"raspi-garten","command":"uname -a"}'
```

Schema ändern: Datei in `server/src/db/schema/` anpassen, dann `pnpm --filter server db:generate`. Die Migrationen laufen beim Serverstart.

## Fehlersuche

| Symptom | Ursache und Abhilfe |
|---|---|
| Gerät bleibt „wartet auf den Daemon“ | `journalctl --user -u device-mcp -n 50` auf dem Gerät (macOS: `tail -n 50 ~/Library/Logs/device-mcp.log`). „Token abgelehnt“: Token neu erzeugen und den Befehl erneut ausführen. |
| Daemon bleibt auf einer alten Version | Im Log nach „Update“ suchen. Ein laufender Job hält den Neustart auf; nach einem Fehler steht der Grund in `~/.local/state/device-mcp/update.json`, der nächste Versuch kommt nach einer Stunde oder sofort mit dem Install-Script. |
| macOS: „Operation not permitted“ | Festplattenvollzugriff für `~/.local/bin/device-mcp` erlauben (siehe „Gerät hinzufügen“). |
| `systemctl --user` geht nicht | Per SSH anmelden statt mit `su`, oder `export XDG_RUNTIME_DIR=/run/user/$(id -u)`. |
| Daemon startet nach Reboot nicht | `loginctl show-user $USER -p Linger` muss `yes` zeigen, sonst `sudo loginctl enable-linger $USER`. |
| Befehl findet ein Programm nicht | Der Service nutzt den PATH aus `~/.config/device-mcp/env` (macOS: aus der plist). Das Install-Script erneut ausführen, wenn sich dein PATH geändert hat. |
| claude.ai meldet einen Auth-Fehler | URL muss auf `/mcp` enden, Header-Wert `Bearer ` plus Token (mit Leerzeichen). |
