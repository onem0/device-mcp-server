import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod/v4'
import { VERSION } from '../version.js'
import { finishAudit, logAudit } from './audit.js'
import { listDevices, type Device } from './devices.js'
import { describeStatus, formatAgo, formatBytes, formatJob, formatOutputChunk, formatRunResult, formatScreen, lineRange, num } from './format.js'
import { sanitizeArgs, short } from './guards.js'
import { DaemonError, hub } from './hub.js'
import { createJob, getJob, recentJobs, rowToSummary, saveJobResult } from './jobs.js'
import { deviceParam, fail, jobIdParam, requireFeature, resolveDevice, resolveOnlineDevice, rpcFailedMessage, text, tool } from './mcp-common.js'
import { registerClaudeTools } from './mcp-claude.js'
import { registerMemoryTools } from './mcp-memory.js'
import { listMemories, memoryCounts } from './memory.js'
import { formatMemoryDigest } from './memory-text.js'
import type { EditFileResult, JobSummary, OutputChunk, ReadFileResult, SessionInfo, SessionScreen, SessionStartResult, WriteFileResult } from './protocol.js'
import { newJobId } from './tokens.js'

const BASE_INSTRUCTIONS = [
  "device-mcp reaches the user's own devices (Linux servers, Raspberry Pis, Macs). list_devices shows them, whether they are online and whether Claude Code is installed there.",
  "Memory: device-mcp has its own memory, shared by every Claude that uses this server (claude.ai, the Claude app, Claude Code on any computer). " +
    "Treat it as the user's memory for everything about their devices, projects, setup and preferences. " +
    'When the user asks you to remember, note or save something (e.g. "merk dir", "speicher das", "remember that"), save it with memory_save. ' +
    'If you also have a memory of your own, save it there only in addition: only this one reaches the user\'s other clients and conversations. ' +
    'When the user refers to something from before or asks what you know, and before you search a device for a file, project, config or service, ' +
    'look at the notes listed below and call memory_search (with the device it also shows the paths used most there). ' +
    'When you find out yourself where something lives or how something is run, save that too: one fact per note, a clear title, the path if there is one. ' +
    'Keep notes true: update or delete wrong ones. Pin only what matters in nearly every conversation.',
  'Claude Code: for coding work on a device (writing or changing code in a project, fixing bugs, refactoring, features, anything that touches several files or needs builds and tests), ' +
    'do not write the code yourself with write_file or edit_file. Hand it to Claude Code on that device with claude_code_start (cwd = the project directory) and follow it with claude_code_status. ' +
    'Give it a complete, self-contained prompt: goal, relevant context from this conversation, constraints, how to verify. Report its result to the user, and continue the same conversation ' +
    'with session_id for follow-ups. Quick lookups, single commands and small config edits stay with run_command, read_file and edit_file.',
  'Interactive programs (prompts, REPLs, ssh, editors, full-screen TUIs): use the tmux sessions. session_send types and can wait for output (wait_for), session_wait waits for the screen ' +
    '(a pattern, quiet, the shell back in front), session_read with highlight=true shows which item is selected in menus. The user\'s own tmux sessions can be read and typed into by their name.',
  'Every device has ~/.claude-tools/ with a README.md. Before you build something new, read the README on the device. ' +
    'Put new helper scripts there and add them to the README with their purpose and how to call them.',
]

// Built per request: the notes go along with the instructions (pinned ones with their content, the rest as an index).
export async function buildInstructions() {
  let digest = ''
  try {
    digest = formatMemoryDigest(await listMemories({}))
  } catch (err) {
    console.error('Loading notes failed', err)
  }
  return [...BASE_INSTRUCTIONS, digest].filter(Boolean).join('\n\n')
}

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
const SESSION_WAIT_DEFAULT_S = 60
const SESSION_WAIT_MAX_S = 600

const sessionParam = z
  .string()
  .min(1)
  .max(120)
  .describe(
    'Session from session_start or session_list: its name with or without the mcp- prefix, or the exact name of one of the user\'s own tmux sessions, ' +
      'optionally with :window or :window.pane (e.g. "main:2").',
  )

const describeDevice = (d: Device, notes: number) => {
  const conn = hub.connection(d.id)
  const state = !d.enabled ? 'disabled' : conn ? 'online' : 'offline'
  const seen = conn ? conn.lastSeen : d.lastSeenAt
  const system = [d.os, d.arch].filter(Boolean).join(', ') || 'system unknown (never connected)'
  const who = d.username && d.hostname ? `${d.username}@${d.hostname}` : (d.hostname ?? '')
  // Only daemons from 0.6.0 on report it.
  const claude = conn && conn.info.claudeCode !== undefined ? (conn.info.claudeCode ?? 'not installed (checked when the daemon connected)') : null
  return [
    `- ${d.name} · ${state}${d.readOnly ? ' · read-only' : ''}`,
    `  id: ${d.id}`,
    `  System: ${system}${d.kernel ? `, kernel ${d.kernel}` : ''}`,
    who ? `  User: ${who}${d.homeDir ? `, home ${d.homeDir}` : ''}` : null,
    claude ? `  Claude Code: ${claude}` : null,
    `  Notes: ${notes}${notes ? ' (memory_search with this device)' : ''}`,
    `  Last seen: ${conn ? 'connected now' : formatAgo(seen)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function createMcpServer() {
  const server = new McpServer({ name: 'device-mcp', version: VERSION }, { instructions: await buildInstructions() })

  server.registerTool(
    'list_devices',
    {
      title: 'List devices',
      description:
        'Lists all devices with online status, operating system, user, whether Claude Code is installed, the number of saved notes and the time of the last connection. ' +
        'Also lists what is in the memory: pinned notes with their content, all other notes by title.',
      // An empty schema instead of none: otherwise the SDK passes its request object (HTTP headers included) as the first argument.
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('list_devices', async (_args, ctx) => {
      const [all, counts, notes] = await Promise.all([listDevices(), memoryCounts(), listMemories({})])
      ctx.summary = `${all.length} devices`
      if (!all.length) return text('No devices yet. Add a device in the web panel and install the daemon on it.')
      const global = counts.get(null) ?? 0
      return text(
        [
          all.map((d) => describeDevice(d, counts.get(d.id) ?? 0)).join('\n\n'),
          `Global notes: ${global}${global ? ' (memory_search)' : ''}`,
          formatMemoryDigest(notes),
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
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
        'wait_ms=0 only sends. Like expect: wait_for=<regex> instead waits until that pattern appears in the output produced after this input ' +
        '(up to timeout seconds), e.g. wait_for "\\[y/N\\]" for the next question of an installer or "\\$ $" for the shell prompt. ' +
        'Note that the shell echoes typed text, so the pattern should not match the input itself. ' +
        'paste=true inserts text as one paste (bracketed paste), better for code into editors and REPLs. ' +
        'Allowed keys: Enter, Tab, BTab, Escape, BSpace, Space, Up, Down, Left, Right, Home, End, PageUp, PageDown, ' +
        'Insert, Delete, F1–F12, single characters, each also with C- (Ctrl), M- (Alt) or S- (Shift). ' +
        "Works for the user's own tmux sessions too (by their name).",
      inputSchema: {
        device: deviceParam,
        session: sessionParam,
        text: z.string().max(100_000).optional().describe('Text that is typed literally.'),
        keys: z.array(z.string().min(1).max(20)).max(50).optional().describe('Keys after the text, e.g. ["Enter"] or ["C-c"].'),
        paste: z.boolean().optional().describe('true: insert text as one paste instead of typing it.'),
        wait_ms: z.number().int().min(0).max(10_000).optional().describe('Wait this long afterwards and return the screen, default 500. 0 = do not wait.'),
        wait_for: z.string().min(1).max(1000).optional().describe('Regular expression (JavaScript syntax, multiline): wait until it appears in the new output.'),
        ignore_case: z.boolean().optional().describe('wait_for ignores upper and lower case.'),
        timeout: z.number().int().min(1).max(SESSION_WAIT_MAX_S).optional().describe(`With wait_for: wait at most this many seconds, default ${SESSION_WAIT_DEFAULT_S}.`),
        highlight: z.boolean().optional().describe('Mark highlighted text on the returned screen with ⟦…⟧ (see session_read).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    tool('session_send', async ({ device: ref, session, text: input, keys, paste, wait_ms, wait_for, ignore_case, timeout, highlight }, ctx) => {
      ctx.summary = `${session}: ${[input ? `"${short(input, 120)}"` : '', ...(keys ?? []), wait_for ? `→ wait for /${short(wait_for, 60)}/` : ''].filter(Boolean).join(' ')}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_send')
      if (paste || wait_for || highlight) requireFeature(device, 'session_wait', 'session_send with paste, wait_for or highlight')
      const waitS = timeout ?? SESSION_WAIT_DEFAULT_S
      const res = await hub.request<SessionScreen | { name: string; screen: null }>(
        device.id,
        'session_send',
        { session, text: input, keys, paste, wait_ms, wait_for, ignore_case, timeout_ms: wait_for ? waitS * 1000 : undefined, highlight },
        wait_for ? (waitS + 30) * 1000 : SESSION_RPC_TIMEOUT_MS,
      )
      if (!('text' in res)) return text(`Sent to ${res.name}. Read the screen with session_read or wait with session_wait.`)
      if (res.dead) ctx.exitCode = res.exitStatus
      return text(formatScreen(res))
    }),
  )

  server.registerTool(
    'session_wait',
    {
      title: 'Wait for session',
      description:
        'Waits until the screen of a session reaches a state, then returns it. Conditions (the first one met ends the wait): ' +
        'pattern = a regular expression is visible on the screen (also if it already was before the call); ' +
        'until_shell = the command typed into the shell has finished and the shell is in front again (for builds, installs, tests started in a session); ' +
        'quiet_ms = the screen has not changed for that long (default 1500 ms if no other condition is given). ' +
        `It always returns when the program in the session ends or after timeout seconds (default ${SESSION_WAIT_DEFAULT_S}, at most ${SESSION_WAIT_MAX_S}). ` +
        'To wait for new output right after typing, session_send with wait_for is more precise.',
      inputSchema: {
        device: deviceParam,
        session: sessionParam,
        pattern: z.string().min(1).max(1000).optional().describe('Regular expression (JavaScript syntax, multiline) that must be visible on the screen.'),
        ignore_case: z.boolean().optional().describe('pattern ignores upper and lower case.'),
        until_shell: z.boolean().optional().describe('true: until the shell is the foreground program again.'),
        quiet_ms: z.number().int().min(100).max(SESSION_WAIT_MAX_S * 1000).optional().describe('Until the screen has not changed for this many milliseconds.'),
        timeout: z.number().int().min(1).max(SESSION_WAIT_MAX_S).optional().describe(`Wait at most this many seconds, default ${SESSION_WAIT_DEFAULT_S}.`),
        highlight: z.boolean().optional().describe('Mark highlighted text on the returned screen with ⟦…⟧ (see session_read).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('session_wait', async ({ device: ref, session, pattern, ignore_case, until_shell, quiet_ms, timeout, highlight }, ctx) => {
      const waitS = timeout ?? SESSION_WAIT_DEFAULT_S
      ctx.summary = `${session}: ${[pattern ? `/${short(pattern, 60)}/` : '', until_shell ? 'until shell' : '', quiet_ms ? `quiet ${quiet_ms} ms` : ''].filter(Boolean).join(', ') || 'until quiet'} (up to ${waitS} s)`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'session_wait', 'session_wait')
      const res = await hub.request<SessionScreen>(
        device.id,
        'session_wait',
        { session, pattern, ignore_case, until_shell, quiet_ms, timeout_ms: waitS * 1000, highlight },
        (waitS + 30) * 1000,
      )
      if (res.dead) ctx.exitCode = res.exitStatus
      return text(formatScreen(res))
    }),
  )

  server.registerTool(
    'session_read',
    {
      title: 'Read session',
      description:
        'Reads the screen of a session as plain text, without colour codes, empty lines at the end removed, with the cursor position and whether a ' +
        'full-screen program (editor, TUI) is in front. scrollback_lines also returns that many older lines from the history (at most 10000). ' +
        'If the command in the session has finished, the exit code and the last output including history come along. ' +
        'highlight=true wraps highlighted text in ⟦…⟧: the selected item of a menu or list (whiptail, dialog, fzf, htop, lazygit, raspi-config), ' +
        'reverse video, a coloured background, which plain text cannot show. ' +
        "Works for the user's own tmux sessions too (by their name, optionally name:window.pane).",
      inputSchema: {
        device: deviceParam,
        session: sessionParam,
        scrollback_lines: z.number().int().min(0).max(10_000).optional().describe('Additional lines from the history, default 0.'),
        highlight: z.boolean().optional().describe('true: mark highlighted text with ⟦…⟧.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('session_read', async ({ device: ref, session, scrollback_lines, highlight }, ctx) => {
      ctx.summary = session
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_read')
      if (highlight) requireFeature(device, 'session_wait', 'session_read with highlight')
      const res = await hub.request<SessionScreen>(device.id, 'session_read', { session, scrollback_lines, highlight }, SESSION_RPC_TIMEOUT_MS)
      if (res.dead) ctx.exitCode = res.exitStatus
      return text(formatScreen(res))
    }),
  )

  server.registerTool(
    'session_list',
    {
      title: 'List sessions',
      description:
        'Lists the mcp sessions on the device with the running program, size, start time and whether someone is watching via tmux attach. ' +
        "all=true also lists the user's own tmux sessions (they can be read and typed into by their name, but not killed).",
      inputSchema: { device: deviceParam, all: z.boolean().optional().describe("true: also the user's own tmux sessions.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('session_list', async ({ device: ref, all }, ctx) => {
      ctx.summary = all ? 'all sessions' : 'sessions'
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_list')
      if (all) requireFeature(device, 'session_wait', 'session_list with all=true')
      const list = await hub.request<SessionInfo[]>(device.id, 'session_list', { all: all === true }, SESSION_RPC_TIMEOUT_MS)
      if (!list.length) return text(all ? 'No tmux session is running on the device.' : 'No mcp session is running on the device. all=true also shows the user\'s own sessions.')
      return text(
        list
          .map((s) => {
            const state = s.dead ? `finished${s.exitStatus !== null ? ` (exit ${s.exitStatus})` : ''}` : `running: ${s.command || '?'}`
            const extra = [s.own ? "the user's own" : null, s.windows && s.windows > 1 ? `${s.windows} windows` : null].filter(Boolean)
            return `- ${s.name}${extra.length ? ` (${extra.join(', ')})` : ''} · ${state} · ${s.width}×${s.height} · started ${formatAgo(new Date(s.created))}${s.attached ? ' · someone is watching' : ''}`
          })
          .join('\n'),
      )
    }),
  )

  server.registerTool(
    'session_kill',
    {
      title: 'Kill session',
      description: "Ends an mcp session including all programs in it. The user's own tmux sessions are not killed.",
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

  registerClaudeTools(server)
  registerMemoryTools(server)
  return server
}
