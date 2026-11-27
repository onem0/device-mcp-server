// MCP tools for Claude Code on the devices: claude_code_start hands a task to `claude -p` on the device,
// claude_code_status follows it. A run is a background job; kill_job stops it.

import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod/v4'
import { env } from '../env.js'
import { finishAudit, logAudit } from './audit.js'
import { createClaudeRun, getClaudeRun, latestRunOfSession, recentClaudeRuns, setClaudeRunCwd } from './claude-runs.js'
import { describeStatus, formatAgo, formatClaudeRun } from './format.js'
import { sanitizeArgs, short } from './guards.js'
import { DaemonError, hub } from './hub.js'
import { createJob, rowToSummary, saveJobResult } from './jobs.js'
import { ToolError, deviceParam, fail, requireFeature, resolveDevice, resolveOnlineDevice, rpcFailedMessage, text, tool } from './mcp-common.js'
import type { ClaudeEventsResult, ClaudeStartResult, JobSummary } from './protocol.js'
import { newJobId } from './tokens.js'

const START_WAIT_DEFAULT_S = 60
const WAIT_MAX_S = 600
// Without since: this many log lines from the end, i.e. the most recent activity.
const TAIL_LINES = 400
const PERMISSION_MODES = ['bypassPermissions', 'acceptEdits', 'plan'] as const
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

const label = (prompt: string, resume: string | null) => {
  const first = prompt.trim().split('\n')[0]!
  return `claude -p ${JSON.stringify(first.length > 160 ? `${first.slice(0, 160)}…` : first)}${resume ? ` (resume ${resume})` : ''}`
}

async function fetchEvents(deviceId: string, jobId: string, since: number | undefined): Promise<ClaudeEventsResult | null> {
  if (!hub.isOnline(deviceId)) return null
  try {
    return await hub.request<ClaudeEventsResult>(deviceId, 'claude_events', since === undefined ? { jobId, tail: TAIL_LINES } : { jobId, offset: since })
  } catch (err) {
    if (err instanceof DaemonError && err.code === 'NOT_FOUND') return null
    throw err
  }
}

// Waits until the job ends, at most waitS. Registers the waiter before it looks, so an end in between is not missed.
async function waitForEnd(deviceId: string, jobId: string, waitS: number, known?: JobSummary): Promise<JobSummary | null> {
  if (waitS <= 0 || !hub.isOnline(deviceId)) return known ?? null
  const wait = hub.waitForJobEnd(jobId, waitS * 1000)
  let job: JobSummary
  try {
    job = known ?? (await hub.request<JobSummary>(deviceId, 'job_status', { jobId }))
  } catch (err) {
    wait.cancel()
    if (err instanceof DaemonError && err.code === 'NOT_FOUND') return null
    throw err
  }
  if (job.status !== 'running') {
    wait.cancel()
    return job
  }
  const end = await wait.promise
  return end ? { ...job, ...end } : job
}

export function registerClaudeTools(server: McpServer) {
  server.registerTool(
    'claude_code_start',
    {
      title: 'Start Claude Code',
      description:
        'Hands a task to Claude Code (claude -p, headless) on the device and starts it as a background run in the project directory. ' +
        'Use this for coding work on a device (writing or changing code, fixing bugs, refactoring, features, anything across several files or with builds and tests) ' +
        'instead of writing the files yourself. Claude Code works in the project with its own tools and the project\'s CLAUDE.md. ' +
        'It cannot ask questions while it runs, so the prompt must be complete: the goal, the context from this conversation it needs, constraints, and how to check the result. ' +
        `The call waits up to wait seconds (default ${START_WAIT_DEFAULT_S}) and returns the progress or the result; follow a longer run with claude_code_status, stop it with kill_job. ` +
        'session_id continues an earlier conversation (follow-ups, corrections), so Claude Code still knows everything from before. ' +
        'Default permission_mode is bypassPermissions: Claude Code may edit files and run commands without asking, like run_command. ' +
        'Needs Claude Code installed and logged in on the device (list_devices shows it).',
      inputSchema: {
        device: deviceParam,
        prompt: z.string().min(1).max(100_000).describe('The complete task for Claude Code.'),
        cwd: z.string().max(4096).optional().describe('Project directory: absolute, with ~ or relative to home. Default: the cwd of the conversation for session_id, otherwise home.'),
        session_id: z.uuid().optional().describe('Continue this conversation (session_id from an earlier claude_code_start or claude_code_status).'),
        model: z
          .string()
          .regex(/^[A-Za-z0-9._:[\]-]{1,100}$/)
          .optional()
          .describe('Model alias or full name, e.g. "opus", "sonnet" or "fable". Default: what Claude Code on the device uses.'),
        effort: z.enum(EFFORTS).optional().describe('Reasoning effort. Default: Claude Code\'s own.'),
        permission_mode: z
          .enum(PERMISSION_MODES)
          .optional()
          .describe('bypassPermissions (default): edits and commands without asking. acceptEdits: edits yes, shell commands are refused. plan: only reads and plans, changes nothing.'),
        timeout: z.number().int().min(60).max(7 * 24 * 3600).optional().describe('Stop the run after this many seconds. Default: no limit.'),
        wait: z.number().int().min(0).max(WAIT_MAX_S).optional().describe(`Wait up to this many seconds for the result, default ${START_WAIT_DEFAULT_S}. 0: return right after the start.`),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    tool('claude_code_start', async (args, ctx) => {
      const { device: ref, prompt, session_id, model, effort, permission_mode, timeout, wait } = args
      ctx.summary = `${session_id ? `resume ${session_id}: ` : ''}${short(prompt, 300)}${args.cwd ? `  [cwd: ${args.cwd}]` : ''}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'claude_code', 'claude_code_start')

      let cwd = args.cwd
      if (session_id) {
        const last = await latestRunOfSession(device.id, session_id)
        if (last?.job.status === 'running') {
          throw new ToolError(
            `This conversation is still running as job ${last.run.jobId}. Wait for it with claude_code_status, or stop it with kill_job, before you continue it.`,
          )
        }
        cwd ??= last?.run.cwd ?? undefined
        if (!cwd) throw new ToolError('Give cwd: the directory this conversation ran in. Claude Code finds a conversation only from its own project directory.')
      }

      const jobId = newJobId()
      const sessionId = session_id ?? randomUUID()
      const mode = permission_mode ?? 'bypassPermissions'
      await createJob({ id: jobId, deviceId: device.id, command: label(prompt, session_id ?? null), cwd, background: true, timeoutSeconds: timeout ?? null })
      await createClaudeRun({ jobId, deviceId: device.id, sessionId, resumed: !!session_id, prompt, cwd: cwd ?? null, model: model ?? null, permissionMode: mode })
      const auditId = await logAudit({ deviceId: device.id, tool: 'claude_code_start', command: ctx.summary, args: sanitizeArgs(args), jobId, status: 'running' })
      ctx.skipAudit = true

      const waitS = wait ?? START_WAIT_DEFAULT_S
      const waiter = waitS > 0 ? hub.waitForJobEnd(jobId, waitS * 1000) : null
      hub.markStarting(jobId)
      let started: ClaudeStartResult
      try {
        started = await hub.request<ClaudeStartResult>(device.id, 'claude_start', {
          jobId,
          prompt,
          cwd,
          sessionId,
          resume: !!session_id,
          model,
          effort,
          permissionMode: mode,
          timeoutMs: timeout ? timeout * 1000 : null,
          oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN ?? null,
        })
      } catch (err) {
        waiter?.cancel()
        const message = rpcFailedMessage(err)
        await saveJobResult(device.id, { id: jobId, status: 'failed', exitCode: null, signal: null, error: message, finishedAt: new Date().toISOString(), durationMs: 0 })
        await finishAudit(auditId, { status: 'failed', error: message })
        return fail(`Claude Code was not started: ${message}`)
      } finally {
        hub.unmarkStarting(jobId)
      }

      let job = started.job
      if (job.cwd) await setClaudeRunCwd(jobId, job.cwd)
      if (waiter) {
        const end = await waiter.promise
        if (end) job = { ...job, ...end }
      }
      const events = await fetchEvents(device.id, jobId, job.status === 'running' ? 0 : undefined).catch(() => null)
      if (events) job = events.job
      const version = started.claude.version ? `Claude Code ${started.claude.version}` : 'Claude Code'
      return text(
        formatClaudeRun({
          device: device.name,
          jobId,
          sessionId,
          cwd: job.cwd || cwd || null,
          job,
          events,
          since: job.status === 'running' ? 0 : undefined,
          note: `${session_id ? 'Continued the conversation' : 'Started'} with ${version}, permission mode ${mode}${model ? `, model ${model}` : ''}.`,
        }),
      )
    }),
  )

  server.registerTool(
    'claude_code_status',
    {
      title: 'Claude Code status',
      description:
        'Shows a Claude Code run from claude_code_start: status, the result when it is done (Claude Code\'s final answer, turns, duration), ' +
        'and its activity as short lines (› text, → tool call, ✗ failed tool, ! message from Claude Code itself). ' +
        `wait=N waits up to N seconds (at most ${WAIT_MAX_S}) for the run to end. since=<line from the last answer> shows only newer activity; ` +
        'without since you get the most recent activity. Without job_id: the recent Claude Code runs on the device.',
      inputSchema: {
        device: deviceParam,
        job_id: z.string().min(1).max(64).optional().describe('job_id from claude_code_start.'),
        wait: z.number().int().min(0).max(WAIT_MAX_S).optional().describe('Wait up to this many seconds for the end, default 0.'),
        since: z.number().int().min(0).optional().describe('Only activity from this log line on (the since value from the last answer).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('claude_code_status', async ({ device: ref, job_id, wait, since }, ctx) => {
      ctx.summary = job_id ? `${job_id}${wait ? ` (up to ${wait} s)` : ''}` : 'recent runs'
      const device = await resolveDevice(ref, ctx)

      if (!job_id) {
        const rows = await recentClaudeRuns(device.id)
        if (!rows.length) return text(`No Claude Code runs on "${device.name}" yet. Start one with claude_code_start.`)
        return text(
          rows
            .map(
              ({ run, job }) =>
                `- ${run.jobId} · ${describeStatus(rowToSummary(job))} · started ${formatAgo(job.startedAt)}\n` +
                `  session_id: ${run.sessionId}${run.resumed ? ' (continued)' : ''} · cwd: ${run.cwd ?? '~'}\n` +
                `  ${short(run.prompt, 200)}`,
            )
            .join('\n'),
        )
      }

      const row = await getClaudeRun(device.id, job_id)
      if (!row) return fail(`No Claude Code run ${job_id} on "${device.name}". Without job_id, claude_code_status lists the recent runs.`)
      if (hub.isOnline(device.id)) requireFeature(device, 'claude_code', 'claude_code_status')

      let job = rowToSummary(row.job)
      const ended = await waitForEnd(device.id, job_id, wait ?? 0)
      if (ended) job = ended
      const events = await fetchEvents(device.id, job_id, since)
      if (events) job = events.job
      ctx.exitCode = job.exitCode
      return text(
        formatClaudeRun({
          device: device.name,
          jobId: job_id,
          sessionId: row.run.sessionId,
          cwd: row.run.cwd ?? (job.cwd || null),
          job,
          events,
          since,
          note: hub.isOnline(device.id) ? undefined : 'The device is offline: state from the database.',
        }),
      )
    }),
  )
}
