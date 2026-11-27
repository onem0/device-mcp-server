import type { ClaudeEvent, ClaudeEventsResult, JobSummary, OutputChunk, SessionScreen, SessionWaitInfo } from './protocol.js'

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '–'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${Math.round(s % 60)} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function formatAgo(date: Date | null | undefined, now = Date.now()) {
  if (!date) return 'never'
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000))
  const rel = s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`
  return `${date.toISOString().replace(/\.\d{3}Z$/, 'Z')} (${rel})`
}

const nf = new Intl.NumberFormat('en-US')
export const num = (n: number) => nf.format(n)
export const lines = (n: number) => `${num(n)} ${n === 1 ? 'line' : 'lines'}`
// Line range, passed 0-based and exclusive, displayed 1-based.
export const lineRange = (from: number, to: number) => (to - from === 1 ? `line ${num(to)}` : `lines ${num(from + 1)}–${num(to)}`)
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export function describeStatus(job: Pick<JobSummary, 'status' | 'exitCode' | 'signal' | 'durationMs' | 'timeoutMs' | 'error' | 'startedAt'>) {
  switch (job.status) {
    case 'running': {
      const ms = Date.now() - new Date(job.startedAt).getTime()
      return `running for ${formatDuration(ms)}`
    }
    case 'exited':
      return `exited with exit_code ${job.exitCode} after ${formatDuration(job.durationMs)}`
    case 'killed':
      return `killed (${job.signal ?? 'signal'}) after ${formatDuration(job.durationMs)}`
    case 'timeout':
      return `killed by timeout after ${formatDuration(job.durationMs)}`
    case 'failed':
      return `failed: ${job.error ?? 'unknown error'}`
    case 'lost':
      return `lost: ${job.error ?? 'the daemon no longer knows this job'}`
  }
}

export function formatJob(job: JobSummary) {
  const out = [
    `job_id: ${job.id}`,
    `Status: ${describeStatus(job)}`,
    `Command: ${job.command}`,
  ]
  if (job.cwd) out.push(`cwd: ${job.cwd}`)
  out.push(`Started: ${job.startedAt}`)
  if (job.finishedAt) out.push(`Finished: ${job.finishedAt}`)
  if (job.timeoutMs) out.push(`Timeout: ${Math.round(job.timeoutMs / 1000)} s`)
  if (job.outputLines >= 0) {
    out.push(`Output: ${lines(job.outputLines)}, ${formatBytes(job.outputBytes)}${job.outputTruncated ? ' (log full, rest discarded)' : ''}`)
  }
  return out.join('\n')
}

// Result of a run_command in the foreground: head, omitted middle, tail.
export function formatRunResult(job: JobSummary, out: OutputChunk | null) {
  const header = [`exit_code: ${job.exitCode ?? '–'}`, `Status: ${describeStatus(job)}`, `job_id: ${job.id}`]
  if (!out) return `${header.join('\n')}\n\n(output not available, try job_output)`
  if (out.totalLines === 0) return `${header.join('\n')}\n\n(no output)`

  const parts = [header.join('\n'), '']
  if (out.omittedLines) {
    parts.push(
      `--- Output: ${lines(out.totalLines)}, showing the first ${num(out.toLine)} and the last ${num(out.totalLines - (out.tailFromLine ?? 0))} ---`,
      out.text,
      `\n[… ${lines(out.omittedLines)} omitted (${lineRange(out.omittedFrom!, out.omittedFrom! + out.omittedLines)}). Fetch with job_output, job_id=${job.id}, offset=${out.omittedFrom}]\n`,
      out.tailText ?? '',
    )
  } else {
    parts.push(`--- Output: ${lines(out.totalLines)} ---`, out.text)
  }
  if (out.truncatedChars) parts.push('\n[Very long lines were truncated.]')
  if (out.job.outputTruncated) parts.push('\n[The log reached its maximum size, later output was discarded.]')
  return parts.join('\n')
}

export function formatOutputChunk(out: OutputChunk) {
  const { job } = out
  if (out.totalLines === 0) return `job_id: ${job.id} · ${describeStatus(job)}\n\n(no output${job.status === 'running' ? ' yet' : ''})`
  const head = `job_id: ${job.id} · ${describeStatus(job)}\n${capitalize(lineRange(out.fromLine, out.toLine))} of ${num(out.totalLines)}`
  const more = out.toLine < out.totalLines ? `\n\n[Continue with offset=${out.toLine}]` : ''
  const cut = out.truncatedChars ? '\n[Very long lines or too much text were truncated.]' : ''
  return `${head}\n---\n${out.text}${more}${cut}`
}

// --- tmux sessions -----------------------------------------------------------------------------------------------

function describeWait(w: SessionWaitInfo) {
  const after = formatDuration(w.waitedMs)
  switch (w.reason) {
    case 'pattern':
      return `Matched "${w.match ?? ''}" after ${after}${w.outputMatched ? ' (in the new output)' : ' (on the screen)'}.`
    case 'quiet':
      return `The screen stayed unchanged; waited ${after}.`
    case 'shell':
      return `The command finished, the shell is in front again (after ${after}).`
    case 'exited':
      return `The program in the session ended (after ${after}).`
    case 'timeout':
      return `Timed out after ${after} without the condition being met. Call again to keep waiting.`
  }
}

export function formatScreen(screen: SessionScreen) {
  const state = screen.dead
    ? `finished${screen.exitStatus !== null ? ` with exit code ${screen.exitStatus}` : ''}`
    : `running${screen.command ? ` (${screen.command})` : ''}`
  const head = [`Session ${screen.name}${screen.own ? " (the user's own)" : ''}`, state, lines(screen.lines)]
  if (screen.cursor && !screen.dead) head.push(`cursor at row ${screen.cursor.row}, column ${screen.cursor.col}`)
  if (screen.alternateScreen) head.push('full-screen program')
  const out = [head.join(' · ')]
  if (screen.wait) out.unshift(describeWait(screen.wait))
  if (screen.highlighted) out.push('Highlighted text (selection, reverse video, coloured background) is marked ⟦like this⟧.')
  return `${out.join('\n')}\n---\n${screen.text || '(screen empty)'}`
}

// --- Claude Code -------------------------------------------------------------------------------------------------

const EVENT_MARK: Record<ClaudeEvent['kind'], string> = { init: '◦', text: '›', tool: '→', error: '✗', output: '!', note: '◦' }

export function formatClaudeEvents(events: ClaudeEvent[], resultText?: string) {
  let list = events
  const last = list.at(-1)
  // The final answer comes again as the result: do not show it twice.
  if (resultText && last?.kind === 'text' && resultText.trim().startsWith(last.text.trim().slice(0, 500))) list = list.slice(0, -1)
  return list
    .map((e) => {
      const [first = '', ...rest] = e.text.split('\n')
      return [`${EVENT_MARK[e.kind]} ${e.sub ? '(subagent) ' : ''}${first}`, ...rest.map((l) => `  ${l}`)].join('\n')
    })
    .join('\n')
}

export function formatCost(usd: number | null) {
  if (usd === null) return null
  return usd < 0.01 ? '< $0.01 at API prices' : `≈ $${usd.toFixed(2)} at API prices`
}

export interface ClaudeRunView {
  device: string
  jobId: string
  sessionId: string
  cwd: string | null
  job: JobSummary
  events: ClaudeEventsResult | null
  // Activity was requested from this line on (since); otherwise it is the tail of the log.
  since?: number
  note?: string
}

export function formatClaudeRun(v: ClaudeRunView) {
  const running = v.job.status === 'running'
  const result = v.events?.result ?? null
  const out = [`Claude Code on "${v.device}" · ${describeStatus(v.job)}`, `job_id: ${v.jobId} · session_id: ${v.sessionId}`]
  if (v.cwd) out.push(`cwd: ${v.cwd}`)
  if (v.note) out.push(v.note)

  if (result) {
    const meta = [
      !result.isError && result.subtype === 'success' ? 'success' : result.subtype === 'success' ? 'error' : `error: ${result.subtype}`,
      result.numTurns !== null ? `${result.numTurns} turns` : null,
      result.durationMs !== null ? formatDuration(result.durationMs) : null,
      formatCost(result.costUsd),
    ].filter(Boolean)
    out.push('', `Result (${meta.join(' · ')}):`, result.text || '(no text)')
    if (result.isError && /not logged in|\/login|invalid api key|authenticat|oauth token/i.test(result.text)) {
      out.push(
        'Claude Code is not logged in on this device. Ask the user to run "claude" there once and log in, ' +
          'or to create a token with "claude setup-token" and set it as CLAUDE_CODE_OAUTH_TOKEN on the device-mcp server.',
      )
    }
    if (result.permissionDenials.length) {
      const counts = new Map<string, number>()
      for (const name of result.permissionDenials) counts.set(name, (counts.get(name) ?? 0) + 1)
      out.push(
        `Blocked by the permission mode: ${[...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ')}. ` +
          'With permission_mode=bypassPermissions Claude Code may do this without asking.',
      )
    }
  } else if (v.job.status === 'killed' || v.job.status === 'timeout') {
    out.push('', `The run was stopped (${v.job.status === 'timeout' ? 'timeout' : 'kill_job'}) before Claude Code finished. Files it changed until then stay changed.`)
  } else if (!running) {
    out.push(
      '',
      'Claude Code ended without a result. Its own messages are in the activity below. Common causes: it is not logged in on the device ' +
        '(run "claude" there once, or set CLAUDE_CODE_OAUTH_TOKEN on the server), or the conversation for session_id was not found in this cwd.',
    )
  }

  const ev = v.events
  if (ev) {
    const shown = formatClaudeEvents(ev.events, result?.text)
    if (shown) {
      const range =
        ev.fromLine > 0
          ? ` (log lines ${num(ev.fromLine + 1)}–${num(ev.toLine)} of ${num(ev.totalLines)}${v.since === undefined ? '; since=0 shows everything from the start' : ''})`
          : ''
      out.push('', `--- Activity${range} ---`, shown)
    } else if (running) {
      out.push('', v.since ? '(no new activity since the last call)' : '(no activity yet)')
    }
    if (ev.hasMore) out.push(`[More activity follows: since=${ev.toLine}]`)
  } else {
    out.push('', '(activity not available: the device is offline or the daemon no longer has the log)')
  }

  out.push('')
  if (running) {
    out.push(
      `Still running. Next: claude_code_status with job_id=${v.jobId}${ev ? `, since=${ev.toLine}` : ''} and wait=300 waits for the end and shows only new activity. ` +
        `Stop it with kill_job job_id=${v.jobId}.`,
    )
  } else {
    out.push(
      `Continue this conversation: claude_code_start with session_id=${v.sessionId}${v.cwd ? ' (same cwd)' : ''}. ` +
        `The user can pick it up on the device too: ${v.cwd ? `cd ${v.cwd} && ` : ''}claude --resume ${v.sessionId}`,
    )
  }
  return out.join('\n')
}
