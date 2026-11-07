// Reine Hilfsfunktionen für die MCP-Tools, ohne Datenbank und ohne Umgebung (testbar).

// Ab welcher Daemon-Version eine Methode existiert. Ältere Daemons kennen sie nicht.
export const DAEMON_FEATURES = {
  edit_file: '0.2.0',
  read_file_base64: '0.2.0',
  sessions: '0.2.0',
} as const

// Diese Tools sind auf Geräten mit „nur lesen“ gesperrt.
export const WRITE_TOOLS = new Set(['run_command', 'write_file', 'edit_file', 'session_start', 'session_send'])

export function compareVersions(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export const daemonTooOld = (version: string | null | undefined, min: string) => !version || compareVersions(version, min) < 0

export function tooOldMessage(device: string, version: string | null | undefined, min: string, tool: string, baseUrl?: string) {
  const update = baseUrl ? `curl -fsSL ${baseUrl}/install.sh | bash` : 'das Install-Script erneut ausführen'
  return (
    `Daemon-Version zu alt: „${device}“ hat ${version ?? 'eine unbekannte Version'}, für ${tool} ist mindestens ${min} nötig. ` +
    `Bitte updaten: auf dem Gerät „${update}“ ausführen (behält den Token). Per run_command so, damit der Neustart des Daemons ` +
    `das Update nicht abbricht: systemd-run --user --collect bash -c '${update}'`
  )
}

const MAX_STRING = 200
// Felder aus dem Request-Kontext des SDK. Landen sie versehentlich in den Argumenten, gehören sie nie ins Log
// (requestInfo enthält die HTTP-Header mit dem Bearer-Token).
const INTERNAL_KEYS = new Set(['requestInfo', 'authInfo', 'signal', 'sendNotification', 'sendRequest', 'requestId', '_meta', 'headers', 'authorization'])
// Inhalte, die nur mit ihrer Länge ins Audit-Log gehören.
const CONTENT_KEYS = new Set(['content'])

function trimString(value: string) {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (+${value.length - MAX_STRING} Zeichen)` : value
}

// Argumente fürs Audit-Log: lange Strings gekürzt, Dateiinhalte nur als Länge.
export function sanitizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (INTERNAL_KEYS.has(key)) continue
    if (CONTENT_KEYS.has(key) && typeof value === 'string') out[key] = `<${value.length} Zeichen>`
    else if (typeof value === 'string') out[key] = trimString(value)
    else if (Array.isArray(value)) out[key] = value.slice(0, 50).map((v) => (typeof v === 'string' ? trimString(v) : v))
    else if (value && typeof value === 'object') out[key] = '<Objekt>'
    else out[key] = value
  }
  return out
}

export const short = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max)}…` : value).replace(/\s+/g, ' ')
