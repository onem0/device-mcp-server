# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single person: the operator (Neo), who makes his own devices (Linux servers, Raspberry Pis, Macs) reachable for Claude. No multi-user, no roles. He mostly opens the web panel on a laptop/desktop, typically while setting up a new device over SSH; the phone is only for checking in. Realistically the panel manages 1 to 5 devices.

## Product Purpose

device-mcp is a self-hosted MCP server through which Claude (claude.ai, mobile app, Claude Code) runs commands and reads and writes files on the operator's devices. Each device runs a daemon that connects to the server over WebSocket. The panel is the administration for it: add devices (the ready-made install command with the token can be copied exactly once, the token itself stays hidden), rename, disable, delete, create a new token, check the online status and trace what Claude did on which device (audit log). Success: a new device is connected in under a minute, and every command from Claude is traceable.

## Positioning

A tool for exactly one person and his own machines, self-hosted on Coolify. The daemons connect on their own initiative (no open ports on the devices), jobs survive connection drops, and every action by Claude ends up in the audit log with exit code and duration.

## Operating Context

- Adding a device: enter a name, copy the install command (contains the token), paste it into the device's SSH terminal, wait until the device shows up as online.
- Occasional check: is a device online, when was it last seen, what did Claude run.
- Setting up the clients: MCP URL `/mcp` with the header `Authorization: Bearer <MCP_TOKEN>` in claude.ai (custom connector) and Claude Code (`claude mcp add --transport http …`).

## Capabilities and Constraints

- Login only with a password from the `.env`, session cookie, rate limit.
- Device token and MCP token are secrets: the device token can be copied exactly once (hidden, never visible in plain text), the MCP token never appears in the panel.
- Daemon for Linux (systemd user service) and macOS (launchd agent), x64 and arm64. The server triggers updates: by clicking "Update" in the panel or, switchable per device, automatically (as of daemon 0.4.0).
- All text is English: program strings (panel, tool descriptions and outputs, error messages, logs, install scripts), code comments and documentation.
- Stack: Nuxt SPA (`ssr: false`), served by Fastify, panel API under `/v1`.

## Brand Commitments

Name: device-mcp. Must under no circumstances look like a generic, interchangeable admin dashboard (explicitly stated by the operator).

## Evidence on Hand

No logos, images or brand assets. The real content is the device data (name, hostname, OS, architecture, kernel, user) and audit entries (tool, command, exit code, duration) that the running server provides.

## Product Principles

1. A secret can be copied once and then never again, and it is never visible in plain text: copying has to succeed reliably the first time.
2. Status before decoration: online/offline and "last seen" are readable at a glance.
3. Traceability: what Claude did is visible per device, completely and honestly, including errors.
4. Few devices, much clarity: each device may have room instead of disappearing in a dense table.
