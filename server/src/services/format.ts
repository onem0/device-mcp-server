import type { JobSummary, OutputChunk } from './protocol.js'

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
// Zeilenbereich, 0-basiert und exklusiv übergeben, 1-basiert angezeigt.
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

// Ergebnis eines run_command im Vordergrund: Kopf, ausgelassene Mitte, Ende.
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
