import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod/v4'
import { VERSION } from '../version.js'
import { audited, finishAudit, logAudit } from './audit.js'
import { findDeviceByRef, listDevices, type Device } from './devices.js'
import { describeStatus, formatAgo, formatBytes, formatJob, formatOutputChunk, formatRunResult, lineRange, num } from './format.js'
import { DaemonError, DeviceOfflineError, hub } from './hub.js'
import { createJob, getJob, recentJobs, rowToSummary, saveJobResult } from './jobs.js'
import type { JobSummary, OutputChunk, ReadFileResult, WriteFileResult } from './protocol.js'
import { newJobId } from './tokens.js'

export const INSTRUCTIONS =
  'Auf jedem Gerät gibt es ~/.claude-tools/ mit einer README.md. Bevor du etwas Neues baust, lies die README auf dem Gerät. ' +
  'Neue Helfer-Scripts legst du dort ab und trägst sie mit Zweck und Aufruf in die README ein.'

const FOREGROUND_DEFAULT_S = 120
const FOREGROUND_MAX_S = 600
const HEAD_LINES = 200
const TAIL_LINES = 200
const FILE_RPC_TIMEOUT_MS = 60_000
// Großzügig unter dem Body-Limit von /mcp (siehe endpoints/mcp.ts).
const WRITE_MAX_CHARS = 10 * 1024 * 1024

const deviceParam = z.string().min(1).max(200).describe('Gerätename oder Geräte-ID aus list_devices.')
const jobIdParam = z.string().min(1).max(64).describe('job_id aus run_command.')

class ToolError extends Error {}

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] })
const fail = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }], isError: true })

// Fängt erwartbare Fehler ab und gibt sie Claude als Tool-Fehler zurück statt als Protokollfehler.
function tool<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args)
    } catch (err) {
      if (err instanceof ToolError || err instanceof DaemonError || err instanceof DeviceOfflineError) return fail(err.message)
      throw err
    }
  }
}

async function resolveDevice(ref: string): Promise<Device> {
  const device = await findDeviceByRef(ref)
  if (device) return device
  const names = (await listDevices()).map((d) => d.name)
  throw new ToolError(
    names.length ? `Kein Gerät „${ref}“. Vorhanden: ${names.join(', ')}.` : `Kein Gerät „${ref}“. Es ist noch kein Gerät angelegt.`,
  )
}

async function resolveOnlineDevice(ref: string): Promise<Device> {
  const device = await resolveDevice(ref)
  if (!device.enabled) throw new ToolError(`Das Gerät „${device.name}“ ist im Panel deaktiviert.`)
  if (!hub.isOnline(device.id)) {
    throw new ToolError(`Das Gerät „${device.name}“ ist offline, zuletzt gesehen ${formatAgo(device.lastSeenAt)}.`)
  }
  return device
}

const describeDevice = (d: Device) => {
  const conn = hub.connection(d.id)
  const state = !d.enabled ? 'deaktiviert' : conn ? 'online' : 'offline'
  const seen = conn ? conn.lastSeen : d.lastSeenAt
  const system = [d.os, d.arch].filter(Boolean).join(', ') || 'System unbekannt (noch nie verbunden)'
  const who = d.username && d.hostname ? `${d.username}@${d.hostname}` : (d.hostname ?? '')
  return [
    `- ${d.name} · ${state}`,
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

export function createMcpServer() {
  const server = new McpServer({ name: 'device-mcp', version: VERSION }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_devices',
    {
      title: 'Geräte auflisten',
      description: 'Listet alle Geräte mit Online-Status, Betriebssystem, Benutzer und Zeitpunkt der letzten Verbindung.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool(async () => {
      const all = await listDevices()
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
    tool(async ({ device: ref, command, cwd, timeout, background }) => {
      const device = await resolveOnlineDevice(ref)
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
        command: cwd ? `${command}  [cwd: ${cwd}]` : command,
        jobId,
        status: 'running',
      })

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
    tool(async ({ device: ref, job_id }) => {
      const device = await resolveDevice(ref)
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
          return text(formatJob(await hub.request<JobSummary>(device.id, 'job_status', { jobId: job_id })))
        } catch (err) {
          if (!(err instanceof DaemonError && err.code === 'NOT_FOUND')) throw err
        }
      }
      const row = await getJob(device.id, job_id)
      if (!row) return fail(`Keinen Job ${job_id} auf „${device.name}“ gefunden.`)
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
    tool(async ({ device: ref, job_id, offset, limit, tail }) => {
      const device = await resolveOnlineDevice(ref)
      const params = tail ? { jobId: job_id, mode: 'tail', lines: tail } : { jobId: job_id, mode: 'range', offset: offset ?? 0, limit: limit ?? 200 }
      return text(formatOutputChunk(await hub.request<OutputChunk>(device.id, 'job_output', params)))
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
    tool(async ({ device: ref, job_id, signal }) => {
      const device = await resolveOnlineDevice(ref)
      const job = await audited({ deviceId: device.id, tool: 'kill_job', command: `${job_id} (${signal ?? 'SIGTERM'})` }, () =>
        hub.request<JobSummary>(device.id, 'job_kill', { jobId: job_id, signal: signal ?? 'SIGTERM' }),
      )
      return text(`${job.status === 'running' ? 'Signal gesendet, der Job läuft noch.' : 'Job beendet.'}\n${formatJob(job)}`)
    }),
  )

  server.registerTool(
    'read_file',
    {
      title: 'Datei lesen',
      description:
        'Liest eine Datei auf dem Gerät. Text kommt zeilenweise (offset/limit für große Dateien, sehr lange Zeilen werden gekürzt). ' +
        'PNG, JPEG, GIF und WebP kommen als Bild zurück (höchstens 3,75 MB). Andere Binärdateien werden nur beschrieben.',
      inputSchema: {
        device: deviceParam,
        path: z.string().min(1).max(4096).describe('Pfad: absolut, mit ~ oder relativ zum Home.'),
        offset: z.number().int().min(0).optional().describe('Anzahl Zeilen, die übersprungen werden. 0 = Anfang.'),
        limit: z.number().int().min(1).max(5000).optional().describe('Höchstens so viele Zeilen, Standard 2000.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool(async ({ device: ref, path, offset, limit }) => {
      const device = await resolveOnlineDevice(ref)
      const res = await audited({ deviceId: device.id, tool: 'read_file', command: path }, () =>
        hub.request<ReadFileResult>(device.id, 'read_file', { path, offset: offset ?? 0, limit: limit ?? 2000 }, FILE_RPC_TIMEOUT_MS),
      )

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
            'Mit run_command lässt sie sich untersuchen, z. B. file, xxd | head oder base64.',
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
    tool(async ({ device: ref, path, content, mode, encoding }) => {
      const device = await resolveOnlineDevice(ref)
      const m = mode ?? 'overwrite'
      const res = await audited({ deviceId: device.id, tool: 'write_file', command: `${path} (${m}, ${formatBytes(Buffer.byteLength(content))})` }, () =>
        hub.request<WriteFileResult>(device.id, 'write_file', { path, content, mode: m, encoding: encoding ?? 'utf8' }, FILE_RPC_TIMEOUT_MS),
      )
      const verb = m === 'append' ? 'angehängt' : res.created ? 'neu angelegt' : 'überschrieben'
      return text(`${res.path} ${verb}: ${formatBytes(res.bytesWritten)} geschrieben, Datei jetzt ${formatBytes(res.size)}.`)
    }),
  )

  return server
}
