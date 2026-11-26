# device-mcp-server

A self-hosted MCP server through which Claude (claude.ai, the Claude app, Claude Code) runs commands and reads and writes files on your own devices (Linux and macOS). For you alone, no multi-user.

```
 claude.ai / App / Claude Code
            │  HTTPS  POST /mcp   Authorization: Bearer <MCP_TOKEN>
            ▼
 ┌──────────────────────────────┐        ┌───────────┐
 │ server  (Fastify, Coolify)   │◄──────►│ Postgres  │  devices, token hashes, jobs, audit log
 │  /mcp   /v1 (panel API)  /   │        └───────────┘
 │  /daemon/ws   /install.sh    │
 └──────────────▲───────────────┘
                │  wss, opened from the device (no open ports on the devices)
     ┌──────────┴──────────┐
  daemon (Raspi)      daemon (Mac) …      systemd user service or launchd agent, runs as your user
```

Two repos:

| Repo | Contents |
|---|---|
| [device-mcp-server](https://github.com/onem0/device-mcp-server) (this one) | Server, web panel, installer, Compose for Coolify |
| [device-mcp-client](https://github.com/onem0/device-mcp-client) | Daemon for the devices, included here as the submodule `daemon/` |

| Folder | Contents |
|---|---|
| `server/` | Fastify server (TypeScript): MCP endpoint, panel API, WebSocket for the daemons, installer. Drizzle + Postgres. |
| `server/panel/` | Web panel, Nuxt SPA (`ssr: false`), served by the server. |
| `server/install/` | `install.sh` and `uninstall.sh`, served by the server. |
| `daemon/` | Submodule pointing to device-mcp-client. From it the Docker image builds the binaries for Linux and macOS (x64 and arm64 each) with `bun build --compile`, plus a `manifest.json` with version and checksums. |
| `docker-compose.yml` | Server + Postgres for Coolify. |

Clone with the submodule:

```bash
git clone --recurse-submodules https://github.com/onem0/device-mcp-server.git
# or afterwards: git submodule update --init
```

The submodule has a relative URL (`../device-mcp-client.git`). That way Coolify clones it with the same access as the server repo.

## Deployment on Coolify

The server currently runs on Coolify (server "Contabo", project "Private") at https://device.onemo.dev. The domain goes through Cloudflare (proxy on).

1. In Coolify: **New Resource → Private Repository (GitHub App)** with `onem0/device-mcp-server`, branch `main`, build pack **Docker Compose**.
   - Base Directory: `/`
   - Docker Compose Location: `/docker-compose.yml`
   - Git submodules must be enabled (the default). The GitHub app needs access to both repos.
2. Under **Environment Variables**, set the values from `.env.example`. To generate them: `openssl rand -hex 32`.

   | Variable | Required | Meaning |
   |---|---|---|
   | `PUBLIC_URL` | yes | Public address, e.g. `https://device.onemo.dev` (no trailing `/`) |
   | `MCP_TOKEN` | yes | Token for `/mcp`, at least 32 characters |
   | `PANEL_PASSWORD` | yes | Password for the web panel, at least 12 characters |
   | `POSTGRES_PASSWORD` | yes | Letters and digits only (it is part of a URL), e.g. `openssl rand -hex 24` |
   | `POSTGRES_USER`, `POSTGRES_DB` | no | Default `devicemcp` |
   | `SESSION_TTL_HOURS` | no | Panel session, default 168 (extended on use) |
   | `HEARTBEAT_INTERVAL_SECONDS` / `HEARTBEAT_TIMEOUT_SECONDS` | no | Default 15 / 45 |
   | `SESSION_MAX_DAYS` | no | Log in again after this many days at the latest, default 30 |
   | `TRUST_PROXY` | no | Number of proxy hops trusted for the client IP. Default `1` (Traefik), behind Cloudflare `2` |
   | `LOG_LEVEL` | no | Default `info` |

3. For the **server** service, enter the domain with the container port: `https://device.onemo.dev:3000`. Coolify generates the Traefik labels including the Let's Encrypt certificate from it; the port is not exposed publicly, it only tells Traefik where to forward to. The domain must match `PUBLIC_URL`.
4. **Deploy.** The first build takes a few minutes (Bun downloads the runtimes for x64 and arm64). The server runs the database migrations on startup; the health check uses `/healthz`.

WebSockets need no extra setting: Traefik and Cloudflare pass the upgrade on `/daemon/ws` through. The daemons send a heartbeat every 15 s, so idle timeouts do not kick in. Postgres has no public port and runs only in the internal Compose network.

`/mcp` responds as an SSE stream and sends a keepalive every 15 s while doing so. Otherwise Cloudflare would abort long `run_command` calls with a 524 after 100 s without data.

Rolling out a new version: push to `main`. Coolify deploys automatically via the GitHub app's webhook. While the container is swapped, server and MCP are gone for about a minute; the daemons then reconnect on their own, and running jobs on the devices keep running.

**Check afterwards:** `https://device.onemo.dev/healthz` responds with `{"ok":true}`, and without a token `curl -i -X POST https://device.onemo.dev/mcp` returns only `401`.

## Adding a device

1. Log in to the panel (`https://device.onemo.dev`) and choose **Add device**. The name is the one you use to refer to the device in Claude (e.g. `raspi-garten`).
2. The panel offers the ready-made install command for copying **exactly once**. The device token is inside the copied command; on screen it is hidden. The database holds only its SHA-256 hash.
3. Run the command on the device as a normal user (not as root):

   ```bash
   curl -fsSL https://device.onemo.dev/install.sh | DEVICE_MCP_TOKEN='dmcp_…' bash
   ```

   The script comes from the server and fetches the daemon from there too: it downloads the matching binary, writes exactly this server into `~/.config/device-mcp/config.json` (chmod 600), creates `~/.claude-tools/README.md` (if it does not exist yet) and sets up the daemon as a service.
   - **Linux:** systemd user service `device-mcp` with `Restart=always`, plus `loginctl enable-linger` so that the daemon starts after a reboot without a login. If linger needs root privileges, the script asks for the sudo password once.
   - **macOS:** LaunchAgent `dev.onemo.device-mcp` (`~/Library/LaunchAgents/`), log in `~/Library/Logs/device-mcp.log`. It runs as long as you are logged in.
4. In the dialog, the display switches to **Connected** as soon as the daemon reports in.

Requirements on the device: Linux with systemd or macOS, x86_64 or arm64, `curl` and `gzip`. No runtime is needed. The form of the command without a token is also in the panel under "Connection".

macOS protects Desktop, Documents and Downloads: if Claude reports "Operation not permitted" there, allow `~/.local/bin/device-mcp` under System Settings → Privacy & Security → Full Disk Access. The binary is ad hoc signed; after an update macOS may ask for the permission again.

### In the panel

- **Rename:** takes effect immediately; Claude uses the new name from then on.
- **Disable:** cuts the connection immediately; Claude can no longer reach the device. After enabling, the daemon reconnects within a minute (or immediately with `systemctl --user restart device-mcp`).
- **New token:** the old token stops being valid immediately. Run the new install command on the device; that only swaps the configuration.
- **Auto-update:** switch per device, off by default. On: the server updates the daemon itself as soon as the device connects with an older version. Off: only by clicking "Update" (see "Updating the daemon").
- **Read-only:** Claude can still read on the device (files, jobs, session screens) but cannot run commands, write or change anything, or type into sessions. `kill_job` and `session_kill` stay allowed so that running things can be stopped. Takes effect immediately, without a reconnect.
- **Delete:** removes the device along with its jobs and audit log.
- **Audit log:** every MCP call with time, device, tool, shortened arguments, result, exit code and duration. Across all devices on the "Audit log" page (with a device filter), per device on its own page. Long arguments are cut to 200 characters; file contents appear only as a length.

### On the device

```bash
systemctl --user status device-mcp      # status
journalctl --user -u device-mcp -f      # log
systemctl --user restart device-mcp     # restart
curl -fsSL https://device.onemo.dev/install.sh | bash   # set up binary and service again, keeps the token
device-mcp-uninstall                    # uninstall (or: curl -fsSL https://device.onemo.dev/uninstall.sh | bash)
```

On macOS, instead of the first three lines:

```bash
launchctl print gui/$(id -u)/dev.onemo.device-mcp          # status
tail -f ~/Library/Logs/device-mcp.log                      # log
launchctl kickstart -k gui/$(id -u)/dev.onemo.device-mcp   # restart
```

The uninstaller removes the service, binary, configuration, job logs and the `mcp-` tmux sessions. `~/.claude-tools` stays, and on Linux so does linger (it may affect other services too). Afterwards, delete the device in the panel.

### Updating the daemon

At `/download/manifest.json` the server serves the version and the SHA-256 checksums of its daemon binaries. If a device runs an older daemon, the panel shows "… available" next to the version under "Daemon", and the device card gets the **Update** button. The daemon does not look for updates on its own: the server triggers them.

- **By click (default):** "Update" in the panel. The device must be online for this.
- **Auto-update (per device, off by default):** turn it on with the "Auto-update" action. The server then triggers the update itself as soon as the device connects with an older daemon, i.e. shortly after every deploy, and immediately when you turn it on.

In both cases the same thing happens on the device. The daemon

1. downloads its binary from this server, unpacks it and checks size and checksum,
2. starts the new binary as a trial with `--version`,
3. replaces itself (`rename`, atomic) and
4. exits as soon as no job is running any more. systemd or launchd then starts the new binary. tmux sessions keep running meanwhile.

The panel shows the state on the device card: "Updating …", then "Installed …" (with a note if it is still waiting for a running job), and on an error the reason and "Try again". If a step fails, the old version stays in operation. Auto-update then retries the same version after one hour at the earliest, a click immediately. There is no downgrade. Only the binary is updated; if the service definition ever changes, run the install script again.

**Daemons before 0.4.0** do not know this yet and need the update by hand one last time; for them the panel shows "Needs a manual update" with the command. If Claude calls a tool that a daemon does not know yet, it gets "Daemon version too old" with the matching hint.

On the device (via SSH):

```bash
curl -fsSL https://device.onemo.dev/install.sh | bash   # fetches the new binary, keeps token and config, restarts the service
```

Or Claude does it itself via `run_command` (Linux). The important part is `systemd-run`: the update restarts the daemon, and without a unit of its own the restart would end the running update along with it.

```bash
systemd-run --user --collect bash -c 'curl -fsSL https://device.onemo.dev/install.sh | bash'
```

The command returns immediately. After about 20 seconds the device is back online with the new version (`list_devices` or the panel).

| Path on the device | Contents |
|---|---|
| `~/.local/bin/device-mcp` | Daemon |
| `~/.config/device-mcp/config.json` | Server URL and device token (chmod 600) |
| `~/.config/device-mcp/env` | Linux: PATH from your shell at install time, so that Claude finds the same programs (on macOS it is in the plist) |
| `~/.config/systemd/user/device-mcp.service` | Linux: systemd unit |
| `~/Library/LaunchAgents/dev.onemo.device-mcp.plist` | macOS: LaunchAgent |
| `~/Library/Logs/device-mcp.log` | macOS: the daemon's log |
| `~/.local/state/device-mcp/jobs/` | Job status and output (the last 300 jobs, at most 14 days) |
| `~/.local/state/device-mcp/update.json` | Only after a failed update: version, time, error |
| `~/.claude-tools/` | Claude's helper scripts, with a README |

## Adding the connector in claude.ai

1. claude.ai → Settings → **Connectors** → **Add custom connector**.
2. URL: `https://device.onemo.dev/mcp`
3. Add a request header:
   - Name: `Authorization`
   - Value: `Bearer <MCP_TOKEN>`
4. Save. The connector is then also available in the Claude app on your phone.

## Adding it to Claude Code

```bash
export MCP_TOKEN='…'   # from the server's .env
claude mcp add --transport http --scope user device-mcp https://device.onemo.dev/mcp \
  --header "Authorization: Bearer $MCP_TOKEN"
```

`--scope user` makes the server available in all projects; without it, it applies only in the current folder. Check with `claude mcp list`.

## MCP tools

All tools except `list_devices` take `device` (name or ID).

| Tool | Notes | Annotation |
|---|---|---|
| `list_devices` | Name, online/offline, OS, architecture, user, last seen | readOnly |
| `run_command` | `command`, optional `cwd`, `timeout` (seconds), `background`. Runs via `bash -c` as your user, without a TTY. Foreground: default 120 s, at most 600 s; the output shows the first and last 200 lines and how much is missing in between. `background=true` returns a `job_id` immediately. | destructive |
| `job_status` | Status, exit code, runtime, amount of output. Without `job_id`: the last 20 jobs | readOnly |
| `job_output` | `offset`/`limit` (lines) or `tail`, also while the job is running | readOnly |
| `kill_job` | SIGTERM to the whole process group, SIGKILL after 5 s | destructive |
| `job_wait` | Waits up to `timeout` s (default 120, at most 600) until the job is finished. Returns status, exit code and the last 50 lines | readOnly |
| `read_file` | Text with `offset`/`limit`; PNG, JPEG, GIF and WebP as an MCP image (at most 3.75 MB); other binary files are only described. With `encoding=base64`, the raw data of any file in chunks (`byte_offset`, `byte_length`, default 256 KB, at most 1 MB per call) | readOnly |
| `write_file` | `mode` overwrite or append, creates missing folders, `encoding` utf8 or base64, at most 10 MB | destructive |
| `edit_file` | Replaces `old_string` with `new_string`; error with the match count on 0 or (without `replace_all`) several matches. Writes atomically (temp file + rename), keeps permissions and LF/CRLF, follows symlinks. Responds with a few lines of context | destructive |
| `session_start` | Starts a tmux session `mcp-<name>` (default: login shell) with `cwd`, `command`, `cols`, `rows`. Survives daemon restarts. Watch on the device with `tmux attach -t mcp-<name>` | destructive |
| `session_send` | `text` is typed literally, then `keys` (Enter, C-c, Up, Tab …). Waits `wait_ms` (default 500) and returns the screen right away | destructive |
| `session_read` | Screen as plain text (`capture-pane -p -J`), without colour codes, trailing empty lines cut off; `scrollback_lines` for history. With the exit code if the command has ended | readOnly |
| `session_list` | The `mcp-` sessions with program, size and status | readOnly |
| `session_kill` | Ends the session along with its programs | destructive |

New as of daemon 0.2.0: `edit_file`, the session tools and `read_file` with base64; `job_wait` also works with older daemons. For sessions the device needs tmux (`sudo apt install tmux`); if it is missing, the tool says so. So that sessions survive a daemon restart, the daemon starts tmux via `systemd-run --user --scope` outside its own cgroup.

The server instructions point Claude to `~/.claude-tools/README.md`: read it first, put new helper scripts there and list them in it.

Jobs survive connection drops: the daemon writes the output to disk and reports the state of all jobs after the reconnect; the server reconciles the database and the audit log. A daemon restart ends running jobs (they then appear as `lost` in the log).

## Security

- Whoever has the `MCP_TOKEN` can run commands on all connected devices. Treat it like an SSH key without a passphrase. The comparison runs in constant time; errors return only `401` without details.
- The panel never shows the MCP token. The panel password lets you manage devices but not run commands.
- Device tokens and panel sessions are stored in the database only as SHA-256 hashes. Login is limited to 10 attempts per 15 minutes and IP; from 30 failed attempts per 15 minutes in total, at most one password per second is checked, no matter from which IP. The cookie is `HttpOnly`, `Secure` and `SameSite=Strict`.
- Panel sessions are extended on use but end after `SESSION_MAX_DAYS` at the latest. A new `PANEL_PASSWORD` logs out all sessions.
- "New token", Disable and Delete disconnect the device immediately, even if it is connecting at that very moment.
- The daemon runs as a normal user. What Claude may do is exactly what that user may do. If the user has passwordless sudo (as on the Pi), access to `/mcp` means root on the device.
- "Read-only" per device blocks `run_command`, `write_file`, `edit_file`, `session_start` and `session_send` on the server before anything goes to the device.
- Every MCP call ends up in the audit log, including rejected ones. Tokens end up neither there nor in the server log: the logger redacts `authorization` and `cookie` headers, and the SDK's request context is filtered out of the logged arguments.
- The daemon opens the connection itself; no port is open on the devices.
- Daemon updates: they start only when someone clicks "Update" in the panel or auto-update is turned on for the device. The daemon downloads new versions only from the server it is connected to, over the same TLS connection as everything else. The checksum in the manifest protects against aborted or corrupted downloads, not against a compromised server; that one can run commands on the devices anyway. Installer, manifest and binaries are publicly accessible and contain no secrets.

## Developing and testing locally

Requirements: Node 24, pnpm 10, Bun, Docker.

```bash
git submodule update --init          # daemon/
pnpm install
cp .env.example .env                 # set the values, plus DATABASE_URL for localhost:5433
pnpm db:up                           # Postgres on :5433
pnpm build:panel                     # build the panel, the server serves it
PORT=3100 pnpm dev:server            # server on :3100, API docs at /docs
```

Daemon against the local server, without installing (details in the device-mcp-client README):

```bash
cd daemon && bun install
printf '{"serverUrl":"http://127.0.0.1:3100","token":"dmcp_…"}' > /tmp/dmcp.json && chmod 600 /tmp/dmcp.json
DEVICE_MCP_CONFIG=/tmp/dmcp.json DEVICE_MCP_STATE_DIR=/tmp/dmcp-state bun run src/index.ts
bun run build                        # binaries into daemon/dist (Linux and macOS, x64 and arm64, each also as .gz) plus manifest.json
```

The whole stack as on Coolify, with ports on your machine:

```bash
docker compose -f docker-compose.yml -f compose.local.yml up -d --build   # http://localhost:3000
```

Tests:

```bash
pnpm --filter server test            # server: version check, read-only list, audit arguments
cd daemon && bun test                # daemon: edit_file and tmux sessions (needs tmux)
```

Trying out the tools with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --transport http \
  --header "Authorization: Bearer $MCP_TOKEN" --method tools/call \
  --tool-name run_command --tool-args-json '{"device":"raspi-garten","command":"uname -a"}'
```

Changing the schema: adjust the file in `server/src/db/schema/`, then `pnpm --filter server db:generate`. The migrations run when the server starts.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Device stays at "waiting for the daemon" | `journalctl --user -u device-mcp -n 50` on the device (macOS: `tail -n 50 ~/Library/Logs/device-mcp.log`). "Token rejected": create a new token and run the command again. |
| Daemon stays on an old version | Without auto-update it takes a click on "Update" in the panel. A running job holds up the restart. After an error, the reason is shown on the device card and in `~/.local/state/device-mcp/update.json`. |
| macOS: "Operation not permitted" | Allow Full Disk Access for `~/.local/bin/device-mcp` (see "Adding a device"). |
| `systemctl --user` does not work | Log in via SSH instead of with `su`, or `export XDG_RUNTIME_DIR=/run/user/$(id -u)`. |
| Daemon does not start after a reboot | `loginctl show-user $USER -p Linger` must show `yes`, otherwise `sudo loginctl enable-linger $USER`. |
| A command cannot find a program | The service uses the PATH from `~/.config/device-mcp/env` (macOS: from the plist). Run the install script again if your PATH has changed. |
| claude.ai reports an auth error | The URL must end in `/mcp`, header value `Bearer ` plus the token (with a space). |
