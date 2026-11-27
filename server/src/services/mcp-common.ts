// Shared parts of the MCP tools: errors, results, audit wrapper, device lookup.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod/v4'
import { env } from '../env.js'
import { VERSION } from '../version.js'
import { latestDaemonVersion } from './daemon-release.js'
import { logAudit } from './audit.js'
import { findDeviceByRef, listDevices, type Device } from './devices.js'
import { ApiError } from './errors.js'
import { formatAgo } from './format.js'
import { DAEMON_FEATURES, WRITE_TOOLS, daemonTooOld, sanitizeArgs, tooOldMessage } from './guards.js'
import { DaemonError, DeviceOfflineError, hub } from './hub.js'

export const deviceParam = z.string().min(1).max(200).describe('Device name or device ID from list_devices.')
export const jobIdParam = z.string().min(1).max(64).describe('job_id from run_command.')

export class ToolError extends Error {}

export const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] })
export const fail = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }], isError: true })

// Per call: which device, what goes into the audit log.
export interface Ctx {
  tool: string
  device: Device | null
  summary: string
  exitCode: number | null
  status: string | null
  // run_command and claude_code_start write their own entry, which the job end completes later.
  skipAudit: boolean
}

const firstText = (result: CallToolResult) => {
  const item = result.content.find((c) => c.type === 'text')
  return item && 'text' in item ? item.text : ''
}

export function daemonVersion(device: Device) {
  return hub.connection(device.id)?.info.version ?? device.daemonVersion
}

// Expected errors go to Claude as tool errors, everything else as protocol errors.
function expectedErrorMessage(err: unknown, ctx: Ctx) {
  if (err instanceof DaemonError && err.code === 'UNKNOWN_METHOD' && ctx.device) {
    return tooOldMessage(ctx.device.name, daemonVersion(ctx.device), latestDaemonVersion() ?? VERSION, ctx.tool, env.PUBLIC_URL)
  }
  if (err instanceof ToolError || err instanceof DaemonError || err instanceof DeviceOfflineError || err instanceof ApiError) return err.message
  return null
}

async function record(ctx: Ctx, args: unknown, started: number, result: CallToolResult) {
  await logAudit({
    deviceId: ctx.device?.id ?? null,
    tool: ctx.tool,
    command: ctx.summary || ctx.tool,
    args: sanitizeArgs(args),
    status: result.isError ? 'error' : (ctx.status ?? 'ok'),
    exitCode: ctx.exitCode,
    durationMs: Date.now() - started,
    error: result.isError ? firstText(result) : null,
  }).catch((err) => console.error('Audit entry failed', err))
}

// Every tool call ends up in the audit log, including failed ones.
export function tool<A>(name: string, fn: (args: A, ctx: Ctx) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    const ctx: Ctx = { tool: name, device: null, summary: '', exitCode: null, status: null, skipAudit: false }
    const started = Date.now()
    let result: CallToolResult
    try {
      result = await fn(args, ctx)
    } catch (err) {
      const message = expectedErrorMessage(err, ctx)
      if (message === null) {
        await record(ctx, args, started, fail(err instanceof Error ? err.message : String(err)))
        throw err
      }
      result = fail(message)
    }
    if (!ctx.skipAudit) await record(ctx, args, started, result)
    return result
  }
}

export async function resolveDevice(ref: string, ctx: Ctx): Promise<Device> {
  const device = await findDeviceByRef(ref)
  if (device) {
    ctx.device = device
    return device
  }
  const names = (await listDevices()).map((d) => d.name)
  throw new ToolError(names.length ? `No device "${ref}". Available: ${names.join(', ')}.` : `No device "${ref}". No device has been added yet.`)
}

export async function resolveOnlineDevice(ref: string, ctx: Ctx): Promise<Device> {
  const device = await resolveDevice(ref, ctx)
  if (!device.enabled) throw new ToolError(`The device "${device.name}" is disabled in the panel.`)
  if (WRITE_TOOLS.has(ctx.tool) && device.readOnly) {
    throw new ToolError(
      `The device "${device.name}" is set to read-only in the panel, ${ctx.tool} is blocked there. ` +
        'Reading still works (read_file, job_status, job_output, job_wait, session_read, session_wait, session_list, claude_code_status), ' +
        'and so do kill_job and session_kill.',
    )
  }
  if (!hub.isOnline(device.id)) {
    throw new ToolError(`The device "${device.name}" is offline, last seen ${formatAgo(device.lastSeenAt)}.`)
  }
  return device
}

// New methods only exist from a certain daemon version on. Check beforehand instead of "unknown method".
export function requireFeature(device: Device, feature: keyof typeof DAEMON_FEATURES, toolName: string) {
  const version = daemonVersion(device)
  const min = DAEMON_FEATURES[feature]
  if (daemonTooOld(version, min)) throw new ToolError(tooOldMessage(device.name, version, min, toolName, env.PUBLIC_URL))
}

export function rpcFailedMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}
