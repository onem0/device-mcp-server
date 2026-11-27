# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

device-mcp lets Claude (claude.ai, the Claude app, Claude Code) run commands and read/write files on the operator's own Linux and macOS devices. This repo is the **server**: one Fastify process with the MCP endpoint, the panel API, the WebSocket the daemons connect to, the install scripts, and the Nuxt panel it serves. Single user, no multi-tenancy. Deployed with Coolify from `docker-compose.yml`; every push to `main` deploys automatically.

The **daemon** that runs on the devices is a separate public repo, [onem0/device-mcp-client](https://github.com/onem0/device-mcp-client). This server neither builds nor hosts it: devices download it from that repo's GitHub releases (`DAEMON_RELEASE_URL`). A local clone may sit in `daemon/`; it is gitignored and has its own git history and its own CLAUDE.md.

## Commands

Requirements: Node 24, pnpm 10, Docker (Bun only for the daemon repo).

```bash
pnpm install
cp .env.example .env                 # plus DATABASE_URL=postgres://devicemcp:<POSTGRES_PASSWORD>@localhost:5433/devicemcp
pnpm db:up                           # Postgres on :5433
pnpm build:panel                     # nuxt generate; the server serves server/panel/.output/public
PORT=3100 pnpm dev:server            # tsx watch, API docs at /docs
pnpm dev:panel                       # panel dev server on :3001, proxies /v1 to API_URL (default 127.0.0.1:3100)

pnpm typecheck                       # server (tsc) + panel (nuxt typecheck)
pnpm --filter server test            # node:test via tsx, all src/**/*.test.ts
cd server && pnpm exec tsx --test --test-name-pattern "<name>" src/services/guards.test.ts   # single test
pnpm --filter server db:generate     # after changing server/src/db/schema/*; migrations run on server start

docker compose -f docker-compose.yml -f compose.local.yml up -d --build   # whole stack on :3000
```

Exercising MCP tools end to end needs a connected daemon (Linux with systemd or macOS) and the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --transport http \
  --header "Authorization: Bearer $MCP_TOKEN" --method tools/call \
  --tool-name run_command --tool-args-json '{"device":"<name>","command":"uname -a"}'
```

## Architecture

**Routing.** `server/src/app.ts` registers `@fastify/autoload` twice: `src/plugins/` (app-wide, wrapped with `fastify-plugin`) and `src/routes/` as the panel API under `/v1`. In `routes/`, one file is one route: the folder path is the URL, the file name is the HTTP method (`routes/devices/_id/update/post.ts` → `POST /v1/devices/:id/update`), `_x` folders become params, and there must be no `index.ts` (autoload would ignore the rest of the folder). Session auth is applied per area through `autohooks.ts`. Validation and OpenAPI use Zod via `@fastify/type-provider-zod`; route files stay thin, logic lives in `src/services/`, shared schemas in `src/schemas/`. Paths outside `/v1` are registered explicitly from `src/endpoints/`: `/mcp`, `/daemon/ws`, `/install.sh`, `/uninstall.sh`, `/download/*`, `/healthz`, and the panel with SPA fallback.

**MCP call path.** `endpoints/mcp.ts` checks the bearer token (`MCP_TOKEN`, constant-time) and creates a fresh, stateless `McpServer` per POST; responses are SSE so the SDK's keepalive stops Cloudflare from cutting long calls. Tools are defined in `services/mcp.ts`, each wrapped in `tool()`, which writes an audit-log entry for every call, including failures. `ToolError`, `DaemonError` and `DeviceOfflineError` become tool errors for Claude; anything else is a protocol error. `resolveOnlineDevice()` enforces enabled, read-only (`WRITE_TOOLS` in `services/guards.ts`) and online, then the tool calls `hub.request(deviceId, method, params)`.

**Daemon connections.** `services/hub.ts` holds every connected daemon in memory: `hello` with the device token (looked up by SHA-256 hash), `welcome`, heartbeats, request/response correlation by id, and `job_exit` events. After a reconnect it reconciles jobs the database still thinks are running. Because this state is in-process, the server runs as a single instance. The wire format is in `services/protocol.ts` and must match `src/protocol.ts` in the daemon repo; change both together.

**Jobs.** `run_command` creates the job row and registers `hub.waitForJobEnd()` before sending `exec`, so very fast commands are not missed. Foreground calls wait up to 600 s; background calls return a `job_id` for `job_status`/`job_output`/`job_wait`. `run_command` writes its own audit entry and completes it when the job ends.

**Daemon versions and updates.** `DAEMON_FEATURES` in `services/guards.ts` gates tools by minimum daemon version; an `UNKNOWN_METHOD` from an older daemon is turned into a "Daemon version too old" message. `services/daemon-release.ts` fetches `manifest.json` of the latest GitHub release every 10 minutes (and on `GET /v1/info`, at most once a minute). `services/updates.ts` sends the daemon an `update` request when someone clicks Update (`POST /v1/devices/:id/update`) or, for devices with `autoUpdate`, when a newer release appears or the device connects with an older daemon; its progress lives in memory and is exposed as `updateStatus` on the device. `/download/*` only passes the GitHub release through for daemons before 0.5.0, which still ask their server.

**Install scripts.** `server/install/install.sh` is served with `__SERVER_URL__` and `__RELEASE_URL__` substituted per request. It must stay compatible with the bash 3.2 that ships with macOS, and it sets up a systemd user service on Linux or a launchd agent on macOS. Device tokens reach it only through `DEVICE_MCP_TOKEN`, never the URL.

**Data.** Drizzle with one table per file in `server/src/db/schema/`, re-exported from `schema/index.ts`; migrations live in `server/drizzle/`. Device tokens and panel sessions are stored only as SHA-256 hashes. The panel offers a device's install command (with the token) for copying exactly once and never displays the token; `MCP_TOKEN` is never exposed by the panel.

**Panel.** Nuxt SPA (`ssr: false`) in `server/panel/`, calling `/v1` with the session cookie. `server/DESIGN.md` is the binding design system (label tape for device names, three type sizes, yellow only for the one-time secret, no generic admin-dashboard patterns); read it before changing UI.

## Conventions

- All text is English: program strings (panel, tool descriptions and outputs, errors, logs, install scripts), code comments and documentation.
- New `/v1` routes follow the file-per-route layout above; new tables get their own schema file plus a line in `schema/index.ts`.
- A new daemon method needs: the handler in the daemon repo, the protocol types in both repos, and a `DAEMON_FEATURES` entry here with the first daemon version that has it.
