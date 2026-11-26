import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod/v4'
import { env } from '../env.js'
import { VERSION } from '../version.js'
import { latestDaemonVersion } from './daemon-release.js'
import { finishAudit, logAudit } from './audit.js'
import { findDeviceByRef, listDevices, type Device } from './devices.js'
import { describeStatus, formatAgo, formatBytes, formatJob, formatOutputChunk, formatRunResult, lineRange, lines, num } from './format.js'
import { DAEMON_FEATURES, WRITE_TOOLS, daemonTooOld, sanitizeArgs, short, tooOldMessage } from './guards.js'
import { DaemonError, DeviceOfflineError, hub } from './hub.js'
import { createJob, getJob, recentJobs, rowToSummary, saveJobResult } from './jobs.js'
import type {
  EditFileResult,
  JobSummary,
  OutputChunk,
  ReadFileResult,
  SessionInfo,
  SessionScreen,
  SessionStartResult,
  WriteFileResult,
} from './protocol.js'
import { newJobId } from './tokens.js'

export const INSTRUCTIONS =
  'Every device has ~/.claude-tools/ with a README.md. Before you build something new, read the README on the device. ' +
  'Put new helper scripts there and add them to the README with their purpose and how to call them.'

const FOREGROUND_DEFAULT_S = 120
const FOREGROUND_MAX_S = 600
const HEAD_LINES = 200
const TAIL_LINES = 200
const WAIT_DEFAULT_S = 120
const WAIT_MAX_S = 600
const WAIT_TAIL_LINES = 50
const FILE_RPC_TIMEOUT_MS = 60_000
// Comfortably below the body limit of /mcp (see endpoints/mcp.ts).
const WRITE_MAX_CHARS = 10 * 1024 * 1024
const EDIT_MAX_CHARS = 1024 * 1024
const BASE64_DEFAULT_BYTES = 256 * 1024
const BASE64_MAX_BYTES = 1024 * 1024
const SESSION_RPC_TIMEOUT_MS = 20_000

const deviceParam = z.string().min(1).max(200).describe('Device name or device ID from list_devices.')
const jobIdParam = z.string().min(1).max(64).describe('job_id from run_command.')
const sessionParam = z.string().min(1).max(60).describe('Session name from session_start or session_list, with or without the mcp- prefix.')

class ToolError extends Error {}

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] })
const fail = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }], isError: true })

// Per call: which device, what goes into the audit log.
interface Ctx {
  tool: string
  device: Device | null
  summary: string
  exitCode: number | null
  status: string | null
  // run_command writes its own entry, which the job end completes later.
  skipAudit: boolean
}

const firstText = (result: CallToolResult) => {
  const item = result.content.find((c) => c.type === 'text')
  return item && 'text' in item ? item.text : ''
}

function daemonVersion(device: Device) {
  return hub.connection(device.id)?.info.version ?? device.daemonVersion
}

// Expected errors go to Claude as tool errors, everything else as protocol errors.
function expectedErrorMessage(err: unknown, ctx: Ctx) {
  if (err instanceof DaemonError && err.code === 'UNKNOWN_METHOD' && ctx.device) {
    return tooOldMessage(ctx.device.name, daemonVersion(ctx.device), latestDaemonVersion() ?? VERSION, ctx.tool, env.PUBLIC_URL)
  }
  if (err instanceof ToolError || err instanceof DaemonError || err instanceof DeviceOfflineError) return err.message
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
function tool<A>(name: string, fn: (args: A, ctx: Ctx) => Promise<CallToolResult>) {
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

async function resolveDevice(ref: string, ctx: Ctx): Promise<Device> {
  const device = await findDeviceByRef(ref)
  if (device) {
    ctx.device = device
    return device
  }
  const names = (await listDevices()).map((d) => d.name)
  throw new ToolError(names.length ? `No device "${ref}". Available: ${names.join(', ')}.` : `No device "${ref}". No device has been added yet.`)
}

async function resolveOnlineDevice(ref: string, ctx: Ctx): Promise<Device> {
  const device = await resolveDevice(ref, ctx)
  if (!device.enabled) throw new ToolError(`The device "${device.name}" is disabled in the panel.`)
  if (WRITE_TOOLS.has(ctx.tool) && device.readOnly) {
    throw new ToolError(
      `The device "${device.name}" is set to read-only in the panel, ${ctx.tool} is blocked there. ` +
        'Reading still works (read_file, job_status, job_output, job_wait, session_read, session_list), and so do kill_job and session_kill.',
    )
  }
  if (!hub.isOnline(device.id)) {
    throw new ToolError(`The device "${device.name}" is offline, last seen ${formatAgo(device.lastSeenAt)}.`)
  }
  return device
}

// New methods only exist from a certain daemon version on. Check beforehand instead of "unknown method".
function requireFeature(device: Device, feature: keyof typeof DAEMON_FEATURES, toolName: string) {
  const version = daemonVersion(device)
  const min = DAEMON_FEATURES[feature]
  if (daemonTooOld(version, min)) throw new ToolError(tooOldMessage(device.name, version, min, toolName, env.PUBLIC_URL))
}

const describeDevice = (d: Device) => {
  const conn = hub.connection(d.id)
  const state = !d.enabled ? 'disabled' : conn ? 'online' : 'offline'
  const seen = conn ? conn.lastSeen : d.lastSeenAt
  const system = [d.os, d.arch].filter(Boolean).join(', ') || 'system unknown (never connected)'
  const who = d.username && d.hostname ? `${d.username}@${d.hostname}` : (d.hostname ?? '')
  return [
    `- ${d.name} · ${state}${d.readOnly ? ' · read-only' : ''}`,
    `  id: ${d.id}`,
    `  System: ${system}${d.kernel ? `, kernel ${d.kernel}` : ''}`,
    who ? `  User: ${who}${d.homeDir ? `, home ${d.homeDir}` : ''}` : null,
    `  Last seen: ${conn ? 'connected now' : formatAgo(seen)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function rpcFailedMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function formatScreen(screen: SessionScreen) {
  const state = screen.dead
    ? `finished${screen.exitStatus !== null ? ` with exit code ${screen.exitStatus}` : ''}`
    : `running${screen.command ? ` (${screen.command})` : ''}`
  return `Session ${screen.name} · ${state} · ${lines(screen.lines)}\n---\n${screen.text || '(screen empty)'}`
}

export function createMcpServer() {
  const server = new McpServer({ name: 'device-mcp', version: VERSION }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_devices',
    {
      title: 'List devices',
      description: 'Lists all devices with online status, operating system, user and time of the last connection.',
      // An empty schema instead of none: otherwise the SDK passes its request object (HTTP headers included) as the first argument.
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('list_devices', async (_args, ctx) => {
      const all = await listDevices()
      ctx.summary = `${all.length} devices`
      if (!all.length) return text('No devices yet. Add a device in the web panel and install the daemon on it.')
      return text(all.map(describeDevice).join('\n\n'))
    }),
  )

  server.registerTool(
    'run_command',
    {
      title: 'Run command',
      description:
        'Runs a shell command via `bash -c` as the daemon user on the device (no TTY, no input on stdin). ' +
        'stdout and stderr come back together. For long output you see the first and last 200 lines and how much is omitted in between; fetch the rest with job_output. ' +
        `In the foreground the call waits until the command ends, at most ${FOREGROUND_MAX_S} s. ` +
        'For longer commands (builds, downloads, servers) set background=true: a job_id comes back right away, ' +
        'job_status and job_output report progress, kill_job stops it.',
      inputSchema: {
        device: deviceParam,
        command: z.string().min(1).max(100_000).describe('Command for bash -c, e.g. "ls -la ~/projects".'),
        cwd: z.string().max(4096).optional().describe('Working directory. Absolute, with ~ or relative to home. Default: home.'),
        timeout: z
          .number()
          .int()
          .min(1)
          .max(7 * 24 * 3600)
          .optional()
          .describe(`Timeout in seconds. Foreground: default ${FOREGROUND_DEFAULT_S}, at most ${FOREGROUND_MAX_S}. Background: no timeout unless given.`),
        background: z.boolean().optional().describe('true: start in the background and return the job_id right away.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    tool('run_command', async (args, ctx) => {
      const { device: ref, command, cwd, timeout, background } = args
      ctx.summary = cwd ? `${command}  [cwd: ${cwd}]` : command
      const device = await resolveOnlineDevice(ref, ctx)
      const bg = background ?? false
      const timeoutS = timeout ?? (bg ? null : FOREGROUND_DEFAULT_S)
      if (!bg && timeoutS! > FOREGROUND_MAX_S) {
        return fail(`The foreground allows at most ${FOREGROUND_MAX_S} s. Set background=true for longer commands.`)
      }

      const jobId = newJobId()
      await createJob({ id: jobId, deviceId: device.id, command, cwd, background: bg, timeoutSeconds: timeoutS })
      const auditId = await logAudit({
        deviceId: device.id,
        tool: 'run_command',
        command: ctx.summary,
        args: sanitizeArgs(args),
        jobId,
        status: 'running',
      })
      ctx.skipAudit = true

      const wait = bg ? null : hub.waitForJobEnd(jobId, (timeoutS! + 30) * 1000)
      hub.markStarting(jobId)
      try {
        await hub.request<JobSummary>(device.id, 'exec', { jobId, command, cwd, timeoutMs: timeoutS ? timeoutS * 1000 : null })
      } catch (err) {
        wait?.cancel()
        const message = rpcFailedMessage(err)
        await saveJobResult(device.id, { id: jobId, status: 'failed', exitCode: null, signal: null, error: message, finishedAt: new Date().toISOString(), durationMs: 0 })
        await finishAudit(auditId, { status: 'failed', error: message })
        return fail(`The command was not started: ${message}`)
      } finally {
        hub.unmarkStarting(jobId)
      }

      if (bg) {
        return text(
          `Background job started.\njob_id: ${jobId}\nDevice: ${device.name}\n` +
            `${timeoutS ? `Timeout: ${timeoutS} s\n` : ''}Progress with job_status, output with job_output (tail for the last lines), stop with kill_job.`,
        )
      }

      const end = await wait!.promise
      if (!end) {
        return text(
          `No result within the timeout, or the connection to the device was lost.\njob_id: ${jobId}\n` +
            'The job may still be running on the device. Check with job_status.',
        )
      }
      let out: OutputChunk | null = null
      try {
        out = await hub.request<OutputChunk>(device.id, 'job_output', { jobId, mode: 'headtail', head: HEAD_LINES, tail: TAIL_LINES })
      } catch {
        out = null
      }
      const summary = out?.job ?? { ...rowToSummary((await getJob(device.id, jobId))!), ...end }
      // A non-zero exit code is a normal result. Only jobs that never ran at all are errors.
      const result = text(formatRunResult(summary, out))
      return summary.status === 'failed' || summary.status === 'lost' ? { ...result, isError: true } : result
    }),
  )

  server.registerTool(
    'job_status',
    {
      title: 'Job status',
      description: 'Shows status, exit code, runtime and output size of a job. Without job_id: the last 20 jobs on the device.',
      inputSchema: { device: deviceParam, job_id: jobIdParam.optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('job_status', async ({ device: ref, job_id }, ctx) => {
      ctx.summary = job_id ?? 'recent jobs'
      const device = await resolveDevice(ref, ctx)
      const online = hub.isOnline(device.id)

      if (!job_id) {
        if (online) {
          const list = await hub.request<JobSummary[]>(device.id, 'job_list', { limit: 20 })
          if (!list.length) return text('There are no jobs on the device yet.')
          return text(list.map((j) => `- ${j.id} · ${describeStatus(j)} · ${j.command.slice(0, 120)}`).join('\n'))
        }
        const rows = await recentJobs(device.id)
        if (!rows.length) return text('There are no jobs for this device yet.')
        return text(
          `Device offline, state from the database:\n` + rows.map((r) => `- ${r.id} · ${describeStatus(rowToSummary(r))} · ${r.command.slice(0, 120)}`).join('\n'),
        )
      }

      if (online) {
        try {
          const job = await hub.request<JobSummary>(device.id, 'job_status', { jobId: job_id })
          ctx.exitCode = job.exitCode
          return text(formatJob(job))
        } catch (err) {
          if (!(err instanceof DaemonError && err.code === 'NOT_FOUND')) throw err
        }
      }
      const row = await getJob(device.id, job_id)
      if (!row) return fail(`No job ${job_id} found on "${device.name}".`)
      ctx.exitCode = row.exitCode
      const note = online ? 'The daemon no longer knows this job (log cleaned up or daemon reinstalled).' : 'Device offline, state from the database.'
      return text(`${formatJob(rowToSummary(row))}\n\n${note}`)
    }),
  )

  server.registerTool(
    'job_output',
    {
      title: 'Job output',
      description:
        'Reads the output of a job line by line, also while it is still running. offset skips lines from the start, limit caps the number of lines. ' +
        'tail=N returns the last N lines and ignores offset.',
      inputSchema: {
        device: deviceParam,
        job_id: jobIdParam,
        offset: z.number().int().min(0).optional().describe('Number of lines to skip. 0 = start.'),
        limit: z.number().int().min(1).max(2000).optional().describe('At most this many lines, default 200.'),
        tail: z.number().int().min(1).max(2000).optional().describe('Only the last N lines.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('job_output', async ({ device: ref, job_id, offset, limit, tail }, ctx) => {
      ctx.summary = tail ? `${job_id} (tail ${tail})` : `${job_id} (from line ${(offset ?? 0) + 1})`
      const device = await resolveOnlineDevice(ref, ctx)
      const params = tail ? { jobId: job_id, mode: 'tail', lines: tail } : { jobId: job_id, mode: 'range', offset: offset ?? 0, limit: limit ?? 200 }
      return text(formatOutputChunk(await hub.request<OutputChunk>(device.id, 'job_output', params)))
    }),
  )

  server.registerTool(
    'job_wait',
    {
      title: 'Wait for job',
      description:
        `Waits until a job is finished, at most timeout seconds (default ${WAIT_DEFAULT_S}, at most ${WAIT_MAX_S}). ` +
        `Returns as soon as the job ends or the time is up, with status, exit code and the last ${WAIT_TAIL_LINES} lines of output. ` +
        'If the job is still running afterwards, just call it again.',
      inputSchema: {
        device: deviceParam,
        job_id: jobIdParam,
        timeout: z.number().int().min(1).max(WAIT_MAX_S).optional().describe(`Wait at most this many seconds, default ${WAIT_DEFAULT_S}.`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('job_wait', async ({ device: ref, job_id, timeout }, ctx) => {
      ctx.summary = `${job_id} (up to ${timeout ?? WAIT_DEFAULT_S} s)`
      const device = await resolveOnlineDevice(ref, ctx)
      const waitS = timeout ?? WAIT_DEFAULT_S
      const started = Date.now()

      // Register the waiter first, then look: that way a job end in between is not lost.
      const wait = hub.waitForJobEnd(job_id, waitS * 1000)
      let job: JobSummary
      try {
        job = await hub.request<JobSummary>(device.id, 'job_status', { jobId: job_id })
      } catch (err) {
        wait.cancel()
        if (err instanceof DaemonError && err.code === 'NOT_FOUND') {
          const row = await getJob(device.id, job_id)
          if (!row) return fail(`No job ${job_id} found on "${device.name}".`)
          ctx.exitCode = row.exitCode
          return text(`${formatJob(rowToSummary(row))}\n\nThe daemon no longer knows this job, state from the database.`)
        }
        throw err
      }
      if (job.status === 'running') {
        const end = await wait.promise
        if (end) job = { ...job, ...end }
      } else {
        wait.cancel()
      }

      let out: OutputChunk | null = null
      try {
        out = await hub.request<OutputChunk>(device.id, 'job_output', { jobId: job_id, mode: 'tail', lines: WAIT_TAIL_LINES })
        job = out.job
      } catch {
        out = null
      }
      ctx.exitCode = job.exitCode
      const waited = Math.round((Date.now() - started) / 1000)
      const head =
        job.status === 'running'
          ? `Job ${job_id} is still running after waiting ${waited} s. Call job_wait again or stop it with kill_job.`
          : `Job ${job_id} is finished.`
      const body = out ? formatOutputChunk(out) : formatJob(job)
      return text(`${head}\n${job.status === 'running' ? '' : `exit_code: ${job.exitCode ?? '–'}\n`}${body}`)
    }),
  )

  server.registerTool(
    'kill_job',
    {
      title: 'Kill job',
      description: 'Stops a running job including its child processes. Default is SIGTERM, followed by SIGKILL after 5 s.',
      inputSchema: {
        device: deviceParam,
        job_id: jobIdParam,
        signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP']).optional().describe('Signal, default SIGTERM.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('kill_job', async ({ device: ref, job_id, signal }, ctx) => {
      ctx.summary = `${job_id} (${signal ?? 'SIGTERM'})`
      const device = await resolveOnlineDevice(ref, ctx)
      const job = await hub.request<JobSummary>(device.id, 'job_kill', { jobId: job_id, signal: signal ?? 'SIGTERM' })
      ctx.exitCode = job.exitCode
      return text(`${job.status === 'running' ? 'Signal sent, the job is still running.' : 'Job finished.'}\n${formatJob(job)}`)
    }),
  )

  server.registerTool(
    'read_file',
    {
      title: 'Read file',
      description:
        'Reads a file on the device. Text comes line by line (offset/limit for large files, very long lines are truncated). ' +
        'PNG, JPEG, GIF and WebP come back as an image (at most 3.75 MB). Other binary files are only described. ' +
        'With encoding=base64 the raw bytes of any file come back as base64, in chunks of byte_length bytes from byte_offset (default 256 KB, at most 1 MB per call).',
      inputSchema: {
        device: deviceParam,
        path: z.string().min(1).max(4096).describe('Path: absolute, with ~ or relative to home.'),
        offset: z.number().int().min(0).optional().describe('Number of lines to skip. 0 = start.'),
        limit: z.number().int().min(1).max(5000).optional().describe('At most this many lines, default 2000.'),
        encoding: z.enum(['utf8', 'base64']).optional().describe('utf8 (default): text or image as above. base64: raw bytes as base64.'),
        byte_offset: z.number().int().min(0).optional().describe('Only with encoding=base64: start at this byte, default 0.'),
        byte_length: z.number().int().min(1).max(BASE64_MAX_BYTES).optional().describe('Only with encoding=base64: this many bytes, default 262144.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('read_file', async ({ device: ref, path, offset, limit, encoding, byte_offset, byte_length }, ctx) => {
      ctx.summary = encoding === 'base64' ? `${path} (base64 from byte ${byte_offset ?? 0})` : path
      const device = await resolveOnlineDevice(ref, ctx)
      if (encoding === 'base64') requireFeature(device, 'read_file_base64', 'read_file with encoding=base64')
      const res = await hub.request<ReadFileResult>(
        device.id,
        'read_file',
        { path, offset: offset ?? 0, limit: limit ?? 2000, encoding: encoding ?? 'utf8', byteOffset: byte_offset ?? 0, byteLength: byte_length ?? BASE64_DEFAULT_BYTES },
        FILE_RPC_TIMEOUT_MS,
      )

      if (res.kind === 'base64') {
        const range = res.length ? `bytes ${num(res.offset)}–${num(res.offset + res.length - 1)} of ${num(res.size)}` : `0 bytes from ${num(res.offset)} (file has ${num(res.size)})`
        const more = res.hasMore ? `\n\n[Continue with byte_offset=${res.offset + res.length}]` : ''
        return text(`${res.path} · ${formatBytes(res.size)} · ${range} · base64\n---\n${res.data}${more}`)
      }
      if (res.kind === 'image') {
        return {
          content: [
            { type: 'text', text: `${res.path} · ${res.mimeType} · ${formatBytes(res.size)}` },
            { type: 'image', data: res.data, mimeType: res.mimeType },
          ],
        }
      }
      if (res.kind === 'binary') {
        return text(
          `${res.path} is a binary file (${res.mimeType ?? 'unknown type'}, ${formatBytes(res.size)}) and is not shown as text. ` +
            'encoding=base64 returns the raw bytes; run_command can inspect it (file, xxd | head).',
        )
      }
      if (res.totalLines === 0) return text(`${res.path} · empty`)
      const range = `${lineRange(res.fromLine, res.toLine)}${res.totalLines != null ? ` of ${num(res.totalLines)}` : ''}`
      const more = res.hasMore ? `\n\n[Continue with offset=${res.toLine}]` : ''
      const cut = res.truncatedChars ? '\n[Very long lines or too much text were truncated.]' : ''
      return text(`${res.path} · ${formatBytes(res.size)} · ${range}\n---\n${res.text}${more}${cut}`)
    }),
  )

  server.registerTool(
    'write_file',
    {
      title: 'Write file',
      description:
        'Writes a file on the device. mode=overwrite replaces the content, mode=append appends. Missing directories are created. ' +
        'Use encoding=base64 for binary data.',
      inputSchema: {
        device: deviceParam,
        path: z.string().min(1).max(4096).describe('Path: absolute, with ~ or relative to home.'),
        content: z.string().max(WRITE_MAX_CHARS).describe('New content.'),
        mode: z.enum(['overwrite', 'append']).optional().describe('Default overwrite.'),
        encoding: z.enum(['utf8', 'base64']).optional().describe('Default utf8.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('write_file', async ({ device: ref, path, content, mode, encoding }, ctx) => {
      const m = mode ?? 'overwrite'
      ctx.summary = `${path} (${m}, ${formatBytes(Buffer.byteLength(content))})`
      const device = await resolveOnlineDevice(ref, ctx)
      const res = await hub.request<WriteFileResult>(device.id, 'write_file', { path, content, mode: m, encoding: encoding ?? 'utf8' }, FILE_RPC_TIMEOUT_MS)
      const verb = m === 'append' ? 'appended' : res.created ? 'created' : 'overwritten'
      return text(`${res.path} ${verb}: ${formatBytes(res.bytesWritten)} written, file is now ${formatBytes(res.size)}.`)
    }),
  )

  server.registerTool(
    'edit_file',
    {
      title: 'Edit file',
      description:
        'Changes a text file on the device in place instead of rewriting it: replaces old_string with new_string. ' +
        'old_string must occur exactly like this (spaces, indentation, line breaks) and be unique. If it occurs more than once, include more surrounding text ' +
        'or set replace_all=true; 0 or several matches return an error with the count. The write is atomic, file permissions and ' +
        'line endings (LF/CRLF) are kept. Returns a confirmation with a few lines of context, not the whole file.',
      inputSchema: {
        device: deviceParam,
        path: z.string().min(1).max(4096).describe('Path: absolute, with ~ or relative to home.'),
        old_string: z.string().min(1).max(EDIT_MAX_CHARS).describe('Text to replace, exactly as in the file.'),
        new_string: z.string().max(EDIT_MAX_CHARS).describe('New text. Empty deletes old_string.'),
        replace_all: z.boolean().optional().describe('true: replace every occurrence. Default false.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('edit_file', async ({ device: ref, path, old_string, new_string, replace_all }, ctx) => {
      ctx.summary = `${path}: "${short(old_string, 60)}" → "${short(new_string, 60)}"${replace_all ? ' (all)' : ''}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'edit_file', 'edit_file')
      const res = await hub.request<EditFileResult>(
        device.id,
        'edit_file',
        { path, old_string, new_string, replace_all: replace_all ?? false },
        FILE_RPC_TIMEOUT_MS,
      )
      const parts = [`${res.path}: ${res.replacements === 1 ? '1 occurrence' : `${res.replacements} occurrences`} replaced${res.crlf ? ' (CRLF kept)' : ''}.`]
      if (res.inPlace) parts.push('Note: the directory is not writable, so the file was written in place instead of atomically.')
      for (const snip of res.snippets) {
        const last = snip.fromLine + snip.lines.length - 1
        const width = String(last).length
        parts.push(`--- ${lineRange(snip.fromLine - 1, last)} ---`, ...snip.lines.map((l, i) => `${String(snip.fromLine + i).padStart(width)}│ ${l}`))
      }
      if (res.replacements > res.snippets.length) parts.push(`(context for the first ${res.snippets.length} of ${res.replacements} occurrences)`)
      return text(parts.join('\n'))
    }),
  )

  server.registerTool(
    'session_start',
    {
      title: 'Start session',
      description:
        'Starts an interactive terminal session (tmux) on the device, for programs that expect input: installers that ask questions, REPLs, ssh, top, editors. ' +
        'Without command the user\'s login shell starts. The name gets the prefix mcp-; without name one is assigned. ' +
        'Then type with session_send and read the screen with session_read; end it with session_kill. ' +
        'The session keeps running even if the daemon restarts. On the device it can be watched with tmux attach -t <name>. ' +
        'For commands that need no input, run_command is simpler.',
      inputSchema: {
        device: deviceParam,
        name: z.string().min(1).max(60).optional().describe('Name, e.g. "build". Allowed: letters, digits, - and _.'),
        cwd: z.string().max(4096).optional().describe('Working directory. Absolute, with ~ or relative to home. Default: home.'),
        command: z.string().min(1).max(10_000).optional().describe('Command instead of the login shell, e.g. "python3". After it ends the screen stays readable.'),
        cols: z.number().int().min(20).max(500).optional().describe('Width in characters, default 200.'),
        rows: z.number().int().min(5).max(200).optional().describe('Height in lines, default 50.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    tool('session_start', async ({ device: ref, name, cwd, command, cols, rows }, ctx) => {
      ctx.summary = `${name ?? '(new)'}: ${command ?? 'login shell'}${cwd ? `  [cwd: ${cwd}]` : ''}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_start')
      const res = await hub.request<SessionStartResult>(device.id, 'session_start', { name, cwd, command, cols, rows }, SESSION_RPC_TIMEOUT_MS)
      ctx.summary = `${res.name}: ${command ?? 'login shell'}${cwd ? `  [cwd: ${cwd}]` : ''}`
      return text(
        `Session ${res.name} started (${res.cols}×${res.rows}, ${res.cwd}).\n` +
          'Send input with session_send (text, keys like ["Enter"]), read the screen with session_read, end it with session_kill.' +
          (res.detachedFromDaemon ? '' : '\nNote: without systemd-run tmux runs in the daemon\'s process tree; a daemon restart ends the session.'),
      )
    }),
  )

  server.registerTool(
    'session_send',
    {
      title: 'Type into session',
      description:
        'Sends input to a session: text is typed literally, then keys are pressed, e.g. ["Enter"], ["C-c"], ["Up", "Enter"], ["Tab"], ["Escape"]. ' +
        'So for a command use text="ls -la" and keys=["Enter"]. Then it waits wait_ms (default 500, at most 10000) and returns the current screen; ' +
        'wait_ms=0 only sends. Allowed keys: Enter, Tab, BTab, Escape, BSpace, Space, Up, Down, Left, Right, Home, End, PageUp, PageDown, ' +
        'Insert, Delete, F1–F12, single characters, each also with C- (Ctrl), M- (Alt) or S- (Shift).',
      inputSchema: {
        device: deviceParam,
        session: sessionParam,
        text: z.string().max(100_000).optional().describe('Text that is typed literally.'),
        keys: z.array(z.string().min(1).max(20)).max(50).optional().describe('Keys after the text, e.g. ["Enter"] or ["C-c"].'),
        wait_ms: z.number().int().min(0).max(10_000).optional().describe('Wait this long afterwards and return the screen, default 500. 0 = do not wait.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    tool('session_send', async ({ device: ref, session, text: input, keys, wait_ms }, ctx) => {
      ctx.summary = `${session}: ${[input ? `"${short(input, 120)}"` : '', ...(keys ?? [])].filter(Boolean).join(' ')}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_send')
      const res = await hub.request<SessionScreen | { name: string; screen: null }>(
        device.id,
        'session_send',
        { session, text: input, keys, wait_ms },
        SESSION_RPC_TIMEOUT_MS,
      )
      if (!('text' in res)) return text(`Sent to ${res.name}. Read the screen with session_read.`)
      if (res.dead) ctx.exitCode = res.exitStatus
      return text(formatScreen(res))
    }),
  )

  server.registerTool(
    'session_read',
    {
      title: 'Read session',
      description:
        'Reads the screen of a session as plain text, without colour codes, empty lines at the end removed. ' +
        'scrollback_lines also returns that many older lines from the history (at most 10000). If the command in the session has finished, ' +
        'the exit code and the last output including history come along.',
      inputSchema: {
        device: deviceParam,
        session: sessionParam,
        scrollback_lines: z.number().int().min(0).max(10_000).optional().describe('Additional lines from the history, default 0.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('session_read', async ({ device: ref, session, scrollback_lines }, ctx) => {
      ctx.summary = session
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_read')
      const res = await hub.request<SessionScreen>(device.id, 'session_read', { session, scrollback_lines }, SESSION_RPC_TIMEOUT_MS)
      if (res.dead) ctx.exitCode = res.exitStatus
      return text(formatScreen(res))
    }),
  )

  server.registerTool(
    'session_list',
    {
      title: 'List sessions',
      description: 'Lists the mcp sessions on the device with the running program, size, start time and whether someone is watching via tmux attach.',
      inputSchema: { device: deviceParam },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('session_list', async ({ device: ref }, ctx) => {
      ctx.summary = 'sessions'
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_list')
      const list = await hub.request<SessionInfo[]>(device.id, 'session_list', {}, SESSION_RPC_TIMEOUT_MS)
      if (!list.length) return text('No mcp session is running on the device.')
      return text(
        list
          .map((s) => {
            const state = s.dead ? `finished${s.exitStatus !== null ? ` (exit ${s.exitStatus})` : ''}` : `running: ${s.command || '?'}`
            return `- ${s.name} · ${state} · ${s.width}×${s.height} · started ${formatAgo(new Date(s.created))}${s.attached ? ' · someone is watching' : ''}`
          })
          .join('\n'),
      )
    }),
  )

  server.registerTool(
    'session_kill',
    {
      title: 'Kill session',
      description: 'Ends a session including all programs in it.',
      inputSchema: { device: deviceParam, session: sessionParam },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('session_kill', async ({ device: ref, session }, ctx) => {
      ctx.summary = session
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_kill')
      const res = await hub.request<{ name: string }>(device.id, 'session_kill', { session }, SESSION_RPC_TIMEOUT_MS)
      return text(`Session ${res.name} ended.`)
    }),
  )

  return server
}
