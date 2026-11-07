import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod/v4'
import { env } from '../env.js'
import { VERSION } from '../version.js'
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
  'Auf jedem Gerät gibt es ~/.claude-tools/ mit einer README.md. Bevor du etwas Neues baust, lies die README auf dem Gerät. ' +
  'Neue Helfer-Scripts legst du dort ab und trägst sie mit Zweck und Aufruf in die README ein.'

const FOREGROUND_DEFAULT_S = 120
const FOREGROUND_MAX_S = 600
const HEAD_LINES = 200
const TAIL_LINES = 200
const WAIT_DEFAULT_S = 120
const WAIT_MAX_S = 600
const WAIT_TAIL_LINES = 50
const FILE_RPC_TIMEOUT_MS = 60_000
// Großzügig unter dem Body-Limit von /mcp (siehe endpoints/mcp.ts).
const WRITE_MAX_CHARS = 10 * 1024 * 1024
const EDIT_MAX_CHARS = 1024 * 1024
const BASE64_DEFAULT_BYTES = 256 * 1024
const BASE64_MAX_BYTES = 1024 * 1024
const SESSION_RPC_TIMEOUT_MS = 20_000

const deviceParam = z.string().min(1).max(200).describe('Gerätename oder Geräte-ID aus list_devices.')
const jobIdParam = z.string().min(1).max(64).describe('job_id aus run_command.')
const sessionParam = z.string().min(1).max(60).describe('Session-Name aus session_start oder session_list, mit oder ohne Präfix mcp-.')

class ToolError extends Error {}

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] })
const fail = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }], isError: true })

// Pro Aufruf: welches Gerät, was ins Audit-Log kommt.
interface Ctx {
  tool: string
  device: Device | null
  summary: string
  exitCode: number | null
  status: string | null
  // run_command schreibt einen eigenen Eintrag, den später das Job-Ende ergänzt.
  skipAudit: boolean
}

const firstText = (result: CallToolResult) => {
  const item = result.content.find((c) => c.type === 'text')
  return item && 'text' in item ? item.text : ''
}

function daemonVersion(device: Device) {
  return hub.connection(device.id)?.info.version ?? device.daemonVersion
}

// Erwartbare Fehler gehen als Tool-Fehler an Claude, alles andere als Protokollfehler.
function expectedErrorMessage(err: unknown, ctx: Ctx) {
  if (err instanceof DaemonError && err.code === 'UNKNOWN_METHOD' && ctx.device) {
    return tooOldMessage(ctx.device.name, daemonVersion(ctx.device), VERSION, ctx.tool, env.PUBLIC_URL)
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
  }).catch((err) => console.error('Audit-Eintrag fehlgeschlagen', err))
}

// Jeder Tool-Aufruf landet im Audit-Log, auch fehlgeschlagene.
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
  throw new ToolError(
    names.length ? `Kein Gerät „${ref}“. Vorhanden: ${names.join(', ')}.` : `Kein Gerät „${ref}“. Es ist noch kein Gerät angelegt.`,
  )
}

async function resolveOnlineDevice(ref: string, ctx: Ctx): Promise<Device> {
  const device = await resolveDevice(ref, ctx)
  if (!device.enabled) throw new ToolError(`Das Gerät „${device.name}“ ist im Panel deaktiviert.`)
  if (WRITE_TOOLS.has(ctx.tool) && device.readOnly) {
    throw new ToolError(
      `Das Gerät „${device.name}“ steht im Panel auf „nur lesen“, ${ctx.tool} ist dort gesperrt. ` +
        'Lesen geht weiter (read_file, job_status, job_output, job_wait, session_read, session_list), ebenso kill_job und session_kill.',
    )
  }
  if (!hub.isOnline(device.id)) {
    throw new ToolError(`Das Gerät „${device.name}“ ist offline, zuletzt gesehen ${formatAgo(device.lastSeenAt)}.`)
  }
  return device
}

// Neue Methoden gibt es erst ab einer bestimmten Daemon-Version. Vorher prüfen statt "unbekannte Methode".
function requireFeature(device: Device, feature: keyof typeof DAEMON_FEATURES, toolName: string) {
  const version = daemonVersion(device)
  const min = DAEMON_FEATURES[feature]
  if (daemonTooOld(version, min)) throw new ToolError(tooOldMessage(device.name, version, min, toolName, env.PUBLIC_URL))
}

const describeDevice = (d: Device) => {
  const conn = hub.connection(d.id)
  const state = !d.enabled ? 'deaktiviert' : conn ? 'online' : 'offline'
  const seen = conn ? conn.lastSeen : d.lastSeenAt
  const system = [d.os, d.arch].filter(Boolean).join(', ') || 'System unbekannt (noch nie verbunden)'
  const who = d.username && d.hostname ? `${d.username}@${d.hostname}` : (d.hostname ?? '')
  return [
    `- ${d.name} · ${state}${d.readOnly ? ' · nur lesen' : ''}`,
    `  id: ${d.id}`,
    `  System: ${system}${d.kernel ? `, Kernel ${d.kernel}` : ''}`,
    who ? `  Benutzer: ${who}${d.homeDir ? `, Home ${d.homeDir}` : ''}` : null,
    `  Zuletzt gesehen: ${conn ? 'jetzt verbunden' : formatAgo(seen)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function rpcFailedMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function formatScreen(screen: SessionScreen) {
  const state = screen.dead
    ? `beendet${screen.exitStatus !== null ? ` mit Exit-Code ${screen.exitStatus}` : ''}`
    : `läuft${screen.command ? ` (${screen.command})` : ''}`
  return `Session ${screen.name} · ${state} · ${lines(screen.lines)}\n---\n${screen.text || '(Bildschirm leer)'}`
}

export function createMcpServer() {
  const server = new McpServer({ name: 'device-mcp', version: VERSION }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_devices',
    {
      title: 'Geräte auflisten',
      description: 'Listet alle Geräte mit Online-Status, Betriebssystem, Benutzer und Zeitpunkt der letzten Verbindung.',
      // Leeres Schema statt keinem: Sonst übergibt das SDK sein Request-Objekt (samt HTTP-Headern) als erstes Argument.
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('list_devices', async (_args, ctx) => {
      const all = await listDevices()
      ctx.summary = `${all.length} Geräte`
      if (!all.length) return text('Noch keine Geräte. Lege im Web-Panel ein Gerät an und installiere dort den Daemon.')
      return text(all.map(describeDevice).join('\n\n'))
    }),
  )

  server.registerTool(
    'run_command',
    {
      title: 'Befehl ausführen',
      description:
        'Führt einen Shell-Befehl über `bash -c` als der Benutzer des Daemons auf dem Gerät aus (kein TTY, keine Eingabe über stdin). ' +
        'stdout und stderr kommen zusammen zurück. Bei langer Ausgabe siehst du die ersten und letzten 200 Zeilen und wie viel dazwischen fehlt, den Rest holst du mit job_output. ' +
        `Im Vordergrund wartet der Aufruf bis zum Ende, höchstens ${FOREGROUND_MAX_S} s. ` +
        'Für länger laufende Befehle (Builds, Downloads, Server) background=true setzen: Dann kommt sofort eine job_id zurück, ' +
        'den Stand liefern job_status und job_output, abbrechen mit kill_job.',
      inputSchema: {
        device: deviceParam,
        command: z.string().min(1).max(100_000).describe('Befehl für bash -c, z. B. "ls -la ~/projekte".'),
        cwd: z.string().max(4096).optional().describe('Arbeitsverzeichnis. Absolut, mit ~ oder relativ zum Home. Standard: Home.'),
        timeout: z
          .number()
          .int()
          .min(1)
          .max(7 * 24 * 3600)
          .optional()
          .describe(`Timeout in Sekunden. Vordergrund: Standard ${FOREGROUND_DEFAULT_S}, höchstens ${FOREGROUND_MAX_S}. Hintergrund: ohne Angabe kein Timeout.`),
        background: z.boolean().optional().describe('true: im Hintergrund starten und sofort die job_id zurückgeben.'),
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
        return fail(`Im Vordergrund sind höchstens ${FOREGROUND_MAX_S} s möglich. Setze background=true für länger laufende Befehle.`)
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
        return fail(`Der Befehl wurde nicht gestartet: ${message}`)
      } finally {
        hub.unmarkStarting(jobId)
      }

      if (bg) {
        return text(
          `Hintergrundjob gestartet.\njob_id: ${jobId}\nGerät: ${device.name}\n` +
            `${timeoutS ? `Timeout: ${timeoutS} s\n` : ''}Stand mit job_status, Ausgabe mit job_output (tail für die letzten Zeilen), abbrechen mit kill_job.`,
        )
      }

      const end = await wait!.promise
      if (!end) {
        return text(
          `Kein Ergebnis innerhalb des Timeouts, oder die Verbindung zum Gerät ist abgebrochen.\njob_id: ${jobId}\n` +
            'Der Job läuft auf dem Gerät eventuell weiter. Prüfe mit job_status.',
        )
      }
      let out: OutputChunk | null = null
      try {
        out = await hub.request<OutputChunk>(device.id, 'job_output', { jobId, mode: 'headtail', head: HEAD_LINES, tail: TAIL_LINES })
      } catch {
        out = null
      }
      const summary = out?.job ?? { ...rowToSummary((await getJob(device.id, jobId))!), ...end }
      // Ein Exit-Code ungleich 0 ist ein normales Ergebnis. Fehler sind nur Jobs, die gar nicht liefen.
      const result = text(formatRunResult(summary, out))
      return summary.status === 'failed' || summary.status === 'lost' ? { ...result, isError: true } : result
    }),
  )

  server.registerTool(
    'job_status',
    {
      title: 'Job-Status',
      description: 'Zeigt Status, Exit-Code, Laufzeit und Ausgabeumfang eines Jobs. Ohne job_id: die letzten 20 Jobs des Geräts.',
      inputSchema: { device: deviceParam, job_id: jobIdParam.optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('job_status', async ({ device: ref, job_id }, ctx) => {
      ctx.summary = job_id ?? 'letzte Jobs'
      const device = await resolveDevice(ref, ctx)
      const online = hub.isOnline(device.id)

      if (!job_id) {
        if (online) {
          const list = await hub.request<JobSummary[]>(device.id, 'job_list', { limit: 20 })
          if (!list.length) return text('Auf dem Gerät gibt es noch keine Jobs.')
          return text(list.map((j) => `- ${j.id} · ${describeStatus(j)} · ${j.command.slice(0, 120)}`).join('\n'))
        }
        const rows = await recentJobs(device.id)
        if (!rows.length) return text('Für dieses Gerät gibt es noch keine Jobs.')
        return text(
          `Gerät offline, Stand aus der Datenbank:\n` + rows.map((r) => `- ${r.id} · ${describeStatus(rowToSummary(r))} · ${r.command.slice(0, 120)}`).join('\n'),
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
      if (!row) return fail(`Keinen Job ${job_id} auf „${device.name}“ gefunden.`)
      ctx.exitCode = row.exitCode
      const note = online ? 'Der Daemon kennt den Job nicht mehr (Log aufgeräumt oder Daemon neu installiert).' : 'Gerät offline, Stand aus der Datenbank.'
      return text(`${formatJob(rowToSummary(row))}\n\n${note}`)
    }),
  )

  server.registerTool(
    'job_output',
    {
      title: 'Job-Ausgabe',
      description:
        'Liest die Ausgabe eines Jobs zeilenweise, auch während er noch läuft. offset überspringt Zeilen ab dem Anfang, limit begrenzt die Anzahl. ' +
        'tail=N liefert die letzten N Zeilen und ignoriert offset.',
      inputSchema: {
        device: deviceParam,
        job_id: jobIdParam,
        offset: z.number().int().min(0).optional().describe('Anzahl Zeilen, die übersprungen werden. 0 = Anfang.'),
        limit: z.number().int().min(1).max(2000).optional().describe('Höchstens so viele Zeilen, Standard 200.'),
        tail: z.number().int().min(1).max(2000).optional().describe('Nur die letzten N Zeilen.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('job_output', async ({ device: ref, job_id, offset, limit, tail }, ctx) => {
      ctx.summary = tail ? `${job_id} (tail ${tail})` : `${job_id} (ab Zeile ${(offset ?? 0) + 1})`
      const device = await resolveOnlineDevice(ref, ctx)
      const params = tail ? { jobId: job_id, mode: 'tail', lines: tail } : { jobId: job_id, mode: 'range', offset: offset ?? 0, limit: limit ?? 200 }
      return text(formatOutputChunk(await hub.request<OutputChunk>(device.id, 'job_output', params)))
    }),
  )

  server.registerTool(
    'job_wait',
    {
      title: 'Auf Job warten',
      description:
        `Wartet, bis ein Job fertig ist, höchstens timeout Sekunden (Standard ${WAIT_DEFAULT_S}, höchstens ${WAIT_MAX_S}). ` +
        `Kommt zurück, sobald der Job endet oder die Zeit um ist, mit Status, Exit-Code und den letzten ${WAIT_TAIL_LINES} Zeilen der Ausgabe. ` +
        'Läuft der Job danach noch, einfach erneut aufrufen.',
      inputSchema: {
        device: deviceParam,
        job_id: jobIdParam,
        timeout: z.number().int().min(1).max(WAIT_MAX_S).optional().describe(`Höchstens so viele Sekunden warten, Standard ${WAIT_DEFAULT_S}.`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('job_wait', async ({ device: ref, job_id, timeout }, ctx) => {
      ctx.summary = `${job_id} (bis ${timeout ?? WAIT_DEFAULT_S} s)`
      const device = await resolveOnlineDevice(ref, ctx)
      const waitS = timeout ?? WAIT_DEFAULT_S
      const started = Date.now()

      // Erst den Warter anmelden, dann nachsehen: So geht ein Job-Ende dazwischen nicht verloren.
      const wait = hub.waitForJobEnd(job_id, waitS * 1000)
      let job: JobSummary
      try {
        job = await hub.request<JobSummary>(device.id, 'job_status', { jobId: job_id })
      } catch (err) {
        wait.cancel()
        if (err instanceof DaemonError && err.code === 'NOT_FOUND') {
          const row = await getJob(device.id, job_id)
          if (!row) return fail(`Keinen Job ${job_id} auf „${device.name}“ gefunden.`)
          ctx.exitCode = row.exitCode
          return text(`${formatJob(rowToSummary(row))}\n\nDer Daemon kennt den Job nicht mehr, Stand aus der Datenbank.`)
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
          ? `Job ${job_id} läuft nach ${waited} s Warten noch. Erneut job_wait aufrufen oder mit kill_job abbrechen.`
          : `Job ${job_id} ist fertig.`
      const body = out ? formatOutputChunk(out) : formatJob(job)
      return text(`${head}\n${job.status === 'running' ? '' : `exit_code: ${job.exitCode ?? '–'}\n`}${body}`)
    }),
  )

  server.registerTool(
    'kill_job',
    {
      title: 'Job abbrechen',
      description: 'Bricht einen laufenden Job samt Kindprozessen ab. Standard ist SIGTERM, nach 5 s folgt SIGKILL.',
      inputSchema: {
        device: deviceParam,
        job_id: jobIdParam,
        signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP']).optional().describe('Signal, Standard SIGTERM.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('kill_job', async ({ device: ref, job_id, signal }, ctx) => {
      ctx.summary = `${job_id} (${signal ?? 'SIGTERM'})`
      const device = await resolveOnlineDevice(ref, ctx)
      const job = await hub.request<JobSummary>(device.id, 'job_kill', { jobId: job_id, signal: signal ?? 'SIGTERM' })
      ctx.exitCode = job.exitCode
      return text(`${job.status === 'running' ? 'Signal gesendet, der Job läuft noch.' : 'Job beendet.'}\n${formatJob(job)}`)
    }),
  )

  server.registerTool(
    'read_file',
    {
      title: 'Datei lesen',
      description:
        'Liest eine Datei auf dem Gerät. Text kommt zeilenweise (offset/limit für große Dateien, sehr lange Zeilen werden gekürzt). ' +
        'PNG, JPEG, GIF und WebP kommen als Bild zurück (höchstens 3,75 MB). Andere Binärdateien werden nur beschrieben. ' +
        `Mit encoding=base64 kommen die Rohdaten jeder Datei als base64, in Stücken von byte_length Bytes ab byte_offset (Standard 256 KB, höchstens 1 MB pro Aufruf).`,
      inputSchema: {
        device: deviceParam,
        path: z.string().min(1).max(4096).describe('Pfad: absolut, mit ~ oder relativ zum Home.'),
        offset: z.number().int().min(0).optional().describe('Anzahl Zeilen, die übersprungen werden. 0 = Anfang.'),
        limit: z.number().int().min(1).max(5000).optional().describe('Höchstens so viele Zeilen, Standard 2000.'),
        encoding: z.enum(['utf8', 'base64']).optional().describe('utf8 (Standard): Text oder Bild wie oben. base64: Rohdaten als base64.'),
        byte_offset: z.number().int().min(0).optional().describe('Nur mit encoding=base64: ab diesem Byte lesen, Standard 0.'),
        byte_length: z.number().int().min(1).max(BASE64_MAX_BYTES).optional().describe('Nur mit encoding=base64: so viele Bytes, Standard 262144.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('read_file', async ({ device: ref, path, offset, limit, encoding, byte_offset, byte_length }, ctx) => {
      ctx.summary = encoding === 'base64' ? `${path} (base64 ab Byte ${byte_offset ?? 0})` : path
      const device = await resolveOnlineDevice(ref, ctx)
      if (encoding === 'base64') requireFeature(device, 'read_file_base64', 'read_file mit encoding=base64')
      const res = await hub.request<ReadFileResult>(
        device.id,
        'read_file',
        { path, offset: offset ?? 0, limit: limit ?? 2000, encoding: encoding ?? 'utf8', byteOffset: byte_offset ?? 0, byteLength: byte_length ?? BASE64_DEFAULT_BYTES },
        FILE_RPC_TIMEOUT_MS,
      )

      if (res.kind === 'base64') {
        const range = res.length ? `Bytes ${num(res.offset)}–${num(res.offset + res.length - 1)} von ${num(res.size)}` : `0 Bytes ab ${num(res.offset)} (Datei hat ${num(res.size)})`
        const more = res.hasMore ? `\n\n[Weiter mit byte_offset=${res.offset + res.length}]` : ''
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
          `${res.path} ist eine Binärdatei (${res.mimeType ?? 'Typ unbekannt'}, ${formatBytes(res.size)}) und wird nicht als Text gezeigt. ` +
            'Mit encoding=base64 kommen die Rohdaten, mit run_command lässt sie sich untersuchen (file, xxd | head).',
        )
      }
      if (res.totalLines === 0) return text(`${res.path} · leer`)
      const range = `${lineRange(res.fromLine, res.toLine)}${res.totalLines != null ? ` von ${num(res.totalLines)}` : ''}`
      const more = res.hasMore ? `\n\n[Weiter mit offset=${res.toLine}]` : ''
      const cut = res.truncatedChars ? '\n[Sehr lange Zeilen oder zu viel Text wurden gekürzt.]' : ''
      return text(`${res.path} · ${formatBytes(res.size)} · ${range}\n---\n${res.text}${more}${cut}`)
    }),
  )

  server.registerTool(
    'write_file',
    {
      title: 'Datei schreiben',
      description:
        'Schreibt eine Datei auf dem Gerät. mode=overwrite ersetzt den Inhalt, mode=append hängt an. Fehlende Ordner werden angelegt. ' +
        'Für Binärdaten encoding=base64.',
      inputSchema: {
        device: deviceParam,
        path: z.string().min(1).max(4096).describe('Pfad: absolut, mit ~ oder relativ zum Home.'),
        content: z.string().max(WRITE_MAX_CHARS).describe('Neuer Inhalt.'),
        mode: z.enum(['overwrite', 'append']).optional().describe('Standard overwrite.'),
        encoding: z.enum(['utf8', 'base64']).optional().describe('Standard utf8.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('write_file', async ({ device: ref, path, content, mode, encoding }, ctx) => {
      const m = mode ?? 'overwrite'
      ctx.summary = `${path} (${m}, ${formatBytes(Buffer.byteLength(content))})`
      const device = await resolveOnlineDevice(ref, ctx)
      const res = await hub.request<WriteFileResult>(device.id, 'write_file', { path, content, mode: m, encoding: encoding ?? 'utf8' }, FILE_RPC_TIMEOUT_MS)
      const verb = m === 'append' ? 'angehängt' : res.created ? 'neu angelegt' : 'überschrieben'
      return text(`${res.path} ${verb}: ${formatBytes(res.bytesWritten)} geschrieben, Datei jetzt ${formatBytes(res.size)}.`)
    }),
  )

  server.registerTool(
    'edit_file',
    {
      title: 'Datei ändern',
      description:
        'Ändert eine Textdatei auf dem Gerät gezielt, statt sie neu zu schreiben: ersetzt old_string durch new_string. ' +
        'old_string muss exakt so vorkommen (Leerzeichen, Einrückung, Zeilenumbrüche) und eindeutig sein. Kommt er mehrfach vor, mehr umgebenden Text ' +
        'angeben oder replace_all=true setzen; bei 0 oder mehreren Treffern kommt ein Fehler mit der Anzahl. Geschrieben wird atomar, Dateirechte und ' +
        'Zeilenenden (LF/CRLF) bleiben erhalten. Zurück kommt eine Bestätigung mit ein paar Zeilen Kontext, nicht die ganze Datei.',
      inputSchema: {
        device: deviceParam,
        path: z.string().min(1).max(4096).describe('Pfad: absolut, mit ~ oder relativ zum Home.'),
        old_string: z.string().min(1).max(EDIT_MAX_CHARS).describe('Text, der ersetzt wird, exakt wie in der Datei.'),
        new_string: z.string().max(EDIT_MAX_CHARS).describe('Neuer Text. Leer löscht old_string.'),
        replace_all: z.boolean().optional().describe('true: alle Vorkommen ersetzen. Standard false.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('edit_file', async ({ device: ref, path, old_string, new_string, replace_all }, ctx) => {
      ctx.summary = `${path}: „${short(old_string, 60)}“ → „${short(new_string, 60)}“${replace_all ? ' (alle)' : ''}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'edit_file', 'edit_file')
      const res = await hub.request<EditFileResult>(
        device.id,
        'edit_file',
        { path, old_string, new_string, replace_all: replace_all ?? false },
        FILE_RPC_TIMEOUT_MS,
      )
      const parts = [`${res.path}: ${res.replacements === 1 ? '1 Stelle' : `${res.replacements} Stellen`} ersetzt${res.crlf ? ' (CRLF beibehalten)' : ''}.`]
      if (res.inPlace) parts.push('Hinweis: Der Ordner ist nicht beschreibbar, deshalb wurde in place statt atomar geschrieben.')
      for (const snip of res.snippets) {
        const last = snip.fromLine + snip.lines.length - 1
        const width = String(last).length
        parts.push(`--- ${lineRange(snip.fromLine - 1, last)} ---`, ...snip.lines.map((l, i) => `${String(snip.fromLine + i).padStart(width)}│ ${l}`))
      }
      if (res.replacements > res.snippets.length) parts.push(`(Kontext zu den ersten ${res.snippets.length} von ${res.replacements} Stellen)`)
      return text(parts.join('\n'))
    }),
  )

  server.registerTool(
    'session_start',
    {
      title: 'Session starten',
      description:
        'Startet eine interaktive Terminal-Session (tmux) auf dem Gerät, für Programme, die Eingaben erwarten: Installer mit Rückfragen, REPLs, ssh, top, Editoren. ' +
        'Ohne command startet die Login-Shell des Benutzers. Der Name bekommt das Präfix mcp-, ohne name wird einer vergeben. ' +
        'Danach mit session_send tippen und mit session_read den Bildschirm lesen; beenden mit session_kill. ' +
        'Die Session läuft weiter, auch wenn der Daemon neu startet. Auf dem Gerät lässt sie sich mit tmux attach -t <name> ansehen. ' +
        'Für Befehle ohne Eingabe ist run_command einfacher.',
      inputSchema: {
        device: deviceParam,
        name: z.string().min(1).max(60).optional().describe('Name, z. B. "build". Erlaubt: Buchstaben, Ziffern, - und _.'),
        cwd: z.string().max(4096).optional().describe('Arbeitsverzeichnis. Absolut, mit ~ oder relativ zum Home. Standard: Home.'),
        command: z.string().min(1).max(10_000).optional().describe('Befehl statt der Login-Shell, z. B. "python3". Nach seinem Ende bleibt der Bildschirm lesbar.'),
        cols: z.number().int().min(20).max(500).optional().describe('Breite in Zeichen, Standard 200.'),
        rows: z.number().int().min(5).max(200).optional().describe('Höhe in Zeilen, Standard 50.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    tool('session_start', async ({ device: ref, name, cwd, command, cols, rows }, ctx) => {
      ctx.summary = `${name ?? '(neu)'}: ${command ?? 'Login-Shell'}${cwd ? `  [cwd: ${cwd}]` : ''}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_start')
      const res = await hub.request<SessionStartResult>(device.id, 'session_start', { name, cwd, command, cols, rows }, SESSION_RPC_TIMEOUT_MS)
      ctx.summary = `${res.name}: ${command ?? 'Login-Shell'}${cwd ? `  [cwd: ${cwd}]` : ''}`
      return text(
        `Session ${res.name} gestartet (${res.cols}×${res.rows}, ${res.cwd}).\n` +
          'Eingaben mit session_send (text, keys wie ["Enter"]), Bildschirm mit session_read, beenden mit session_kill.' +
          (res.detachedFromDaemon ? '' : '\nHinweis: Ohne systemd-run läuft tmux im Prozessbaum des Daemons; ein Neustart des Daemons beendet die Session.'),
      )
    }),
  )

  server.registerTool(
    'session_send',
    {
      title: 'In Session tippen',
      description:
        'Schickt Eingaben an eine Session: text wird wörtlich getippt, danach werden keys als Tasten gedrückt, z. B. ["Enter"], ["C-c"], ["Up", "Enter"], ["Tab"], ["Escape"]. ' +
        'Für einen Befehl also text="ls -la" und keys=["Enter"]. Danach wird wait_ms gewartet (Standard 500, höchstens 10000) und der aktuelle Bildschirm ' +
        'zurückgegeben; wait_ms=0 schickt nur ab. Erlaubte Tasten: Enter, Tab, BTab, Escape, BSpace, Space, Up, Down, Left, Right, Home, End, PageUp, PageDown, ' +
        'Insert, Delete, F1–F12, einzelne Zeichen, jeweils auch mit C- (Strg), M- (Alt) oder S- (Umschalt).',
      inputSchema: {
        device: deviceParam,
        session: sessionParam,
        text: z.string().max(100_000).optional().describe('Text, der wörtlich getippt wird.'),
        keys: z.array(z.string().min(1).max(20)).max(50).optional().describe('Tasten nach dem Text, z. B. ["Enter"] oder ["C-c"].'),
        wait_ms: z.number().int().min(0).max(10_000).optional().describe('Danach so lange warten und den Bildschirm liefern, Standard 500. 0 = nicht warten.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    tool('session_send', async ({ device: ref, session, text: input, keys, wait_ms }, ctx) => {
      ctx.summary = `${session}: ${[input ? `„${short(input, 120)}“` : '', ...(keys ?? [])].filter(Boolean).join(' ')}`
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_send')
      const res = await hub.request<SessionScreen | { name: string; screen: null }>(
        device.id,
        'session_send',
        { session, text: input, keys, wait_ms },
        SESSION_RPC_TIMEOUT_MS,
      )
      if (!('text' in res)) return text(`An ${res.name} gesendet. Bildschirm mit session_read.`)
      if (res.dead) ctx.exitCode = res.exitStatus
      return text(formatScreen(res))
    }),
  )

  server.registerTool(
    'session_read',
    {
      title: 'Session lesen',
      description:
        'Liest den Bildschirm einer Session als reinen Text, ohne Farbcodes, leere Zeilen am Ende abgeschnitten. ' +
        'scrollback_lines holt zusätzlich so viele ältere Zeilen aus dem Verlauf (höchstens 10000). Ist der Befehl in der Session beendet, ' +
        'kommen der Exit-Code und die letzte Ausgabe samt Verlauf mit.',
      inputSchema: {
        device: deviceParam,
        session: sessionParam,
        scrollback_lines: z.number().int().min(0).max(10_000).optional().describe('Zusätzliche Zeilen aus dem Verlauf, Standard 0.'),
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
      title: 'Sessions auflisten',
      description: 'Listet die mcp-Sessions auf dem Gerät mit laufendem Programm, Größe, Startzeit und ob jemand per tmux attach zuschaut.',
      inputSchema: { device: deviceParam },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool('session_list', async ({ device: ref }, ctx) => {
      ctx.summary = 'Sessions'
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_list')
      const list = await hub.request<SessionInfo[]>(device.id, 'session_list', {}, SESSION_RPC_TIMEOUT_MS)
      if (!list.length) return text('Auf dem Gerät läuft keine mcp-Session.')
      return text(
        list
          .map((s) => {
            const state = s.dead ? `beendet${s.exitStatus !== null ? ` (Exit ${s.exitStatus})` : ''}` : `läuft: ${s.command || '?'}`
            return `- ${s.name} · ${state} · ${s.width}×${s.height} · seit ${formatAgo(new Date(s.created))}${s.attached ? ' · jemand schaut zu' : ''}`
          })
          .join('\n'),
      )
    }),
  )

  server.registerTool(
    'session_kill',
    {
      title: 'Session beenden',
      description: 'Beendet eine Session samt allen Programmen darin.',
      inputSchema: { device: deviceParam, session: sessionParam },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    tool('session_kill', async ({ device: ref, session }, ctx) => {
      ctx.summary = session
      const device = await resolveOnlineDevice(ref, ctx)
      requireFeature(device, 'sessions', 'session_kill')
      const res = await hub.request<{ name: string }>(device.id, 'session_kill', { session }, SESSION_RPC_TIMEOUT_MS)
      return text(`Session ${res.name} beendet.`)
    }),
  )

  return server
}
