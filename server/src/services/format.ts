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
  if (!date) return 'nie'
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000))
  const rel = s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} min` : s < 86400 ? `vor ${Math.round(s / 3600)} h` : `vor ${Math.round(s / 86400)} Tagen`
  return `${date.toISOString().replace(/\.\d{3}Z$/, 'Z')} (${rel})`
}

const nf = new Intl.NumberFormat('de-DE')
export const num = (n: number) => nf.format(n)
export const lines = (n: number) => `${num(n)} ${n === 1 ? 'Zeile' : 'Zeilen'}`
// Zeilenbereich, 0-basiert und exklusiv übergeben, 1-basiert angezeigt.
export const lineRange = (from: number, to: number) => (to - from === 1 ? `Zeile ${num(to)}` : `Zeilen ${num(from + 1)}–${num(to)}`)

export function describeStatus(job: Pick<JobSummary, 'status' | 'exitCode' | 'signal' | 'durationMs' | 'timeoutMs' | 'error' | 'startedAt'>) {
  switch (job.status) {
    case 'running': {
      const ms = Date.now() - new Date(job.startedAt).getTime()
      return `läuft seit ${formatDuration(ms)}`
    }
    case 'exited':
      return `beendet mit exit_code ${job.exitCode} nach ${formatDuration(job.durationMs)}`
    case 'killed':
      return `abgebrochen (${job.signal ?? 'Signal'}) nach ${formatDuration(job.durationMs)}`
    case 'timeout':
      return `wegen Timeout abgebrochen nach ${formatDuration(job.durationMs)}`
    case 'failed':
      return `fehlgeschlagen: ${job.error ?? 'unbekannter Fehler'}`
    case 'lost':
      return `verloren: ${job.error ?? 'der Daemon kennt den Job nicht mehr'}`
  }
}

export function formatJob(job: JobSummary) {
  const out = [
    `job_id: ${job.id}`,
    `Status: ${describeStatus(job)}`,
    `Befehl: ${job.command}`,
  ]
  if (job.cwd) out.push(`cwd: ${job.cwd}`)
  out.push(`Gestartet: ${job.startedAt}`)
  if (job.finishedAt) out.push(`Beendet: ${job.finishedAt}`)
  if (job.timeoutMs) out.push(`Timeout: ${Math.round(job.timeoutMs / 1000)} s`)
  if (job.outputLines >= 0) {
    out.push(`Ausgabe: ${lines(job.outputLines)}, ${formatBytes(job.outputBytes)}${job.outputTruncated ? ' (Log voll, Rest verworfen)' : ''}`)
  }
  return out.join('\n')
}

// Ergebnis eines run_command im Vordergrund: Kopf, ausgelassene Mitte, Ende.
export function formatRunResult(job: JobSummary, out: OutputChunk | null) {
  const header = [`exit_code: ${job.exitCode ?? '–'}`, `Status: ${describeStatus(job)}`, `job_id: ${job.id}`]
  if (!out) return `${header.join('\n')}\n\n(Ausgabe nicht abrufbar, versuche job_output)`
  if (out.totalLines === 0) return `${header.join('\n')}\n\n(keine Ausgabe)`

  const parts = [header.join('\n'), '']
  if (out.omittedLines) {
    parts.push(
      `--- Ausgabe: ${lines(out.totalLines)}, gezeigt werden die ersten ${num(out.toLine)} und die letzten ${num(out.totalLines - (out.tailFromLine ?? 0))} ---`,
      out.text,
      `\n[… ${lines(out.omittedLines)} ausgelassen (${lineRange(out.omittedFrom!, out.omittedFrom! + out.omittedLines)}). Abrufen mit job_output, job_id=${job.id}, offset=${out.omittedFrom}]\n`,
      out.tailText ?? '',
    )
  } else {
    parts.push(`--- Ausgabe: ${lines(out.totalLines)} ---`, out.text)
  }
  if (out.truncatedChars) parts.push('\n[Sehr lange Zeilen wurden gekürzt.]')
  if (out.job.outputTruncated) parts.push('\n[Das Log hat die Höchstgröße erreicht, spätere Ausgabe wurde verworfen.]')
  return parts.join('\n')
}

export function formatOutputChunk(out: OutputChunk) {
  const { job } = out
  if (out.totalLines === 0) return `job_id: ${job.id} · ${describeStatus(job)}\n\n(keine Ausgabe${job.status === 'running' ? ' bisher' : ''})`
  const head = `job_id: ${job.id} · ${describeStatus(job)}\n${lineRange(out.fromLine, out.toLine)} von ${num(out.totalLines)}`
  const more = out.toLine < out.totalLines ? `\n\n[Weiter mit offset=${out.toLine}]` : ''
  const cut = out.truncatedChars ? '\n[Sehr lange Zeilen oder zu viel Text wurden gekürzt.]' : ''
  return `${head}\n---\n${out.text}${more}${cut}`
}
