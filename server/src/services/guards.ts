// Reine Hilfsfunktionen für die MCP-Tools, ohne Datenbank und ohne Umgebung (testbar).

// Ab welcher Daemon-Version eine Methode existiert. Ältere Daemons kennen sie nicht.
export const DAEMON_FEATURES = {
  edit_file: '0.2.0',
  read_file_base64: '0.2.0',
  sessions: '0.2.0',
} as const

// Ab dieser Version kennt der Daemon die Methode "update": Der Server kann ihn aus dem Panel heraus aktualisieren.
export const REMOTE_UPDATE_SINCE = '0.4.0'

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

// available: Der Daemon ist älter als der vom Server ausgelieferte und lässt sich aus dem Panel aktualisieren.
// manual: Er ist zu alt dafür, das Install-Script muss einmal von Hand laufen.
export function daemonUpdateState(version: string | null | undefined, latest: string | null | undefined): 'available' | 'manual' | null {
  if (!version || !latest || compareVersions(version, latest) >= 0) return null
  return daemonTooOld(version, REMOTE_UPDATE_SINCE) ? 'manual' : 'available'
}

export function tooOldMessage(device: string, version: string | null | undefined, min: string, tool: string, baseUrl?: string) {
  const update = baseUrl ? `curl -fsSL ${baseUrl}/install.sh | bash` : 'run the install script again'
  if (!daemonTooOld(version, REMOTE_UPDATE_SINCE)) {
    return (
      `Daemon version too old: "${device}" has ${version}, ${tool} needs at least ${min}. Ask the user to click "Update" ` +
      `for this device in the panel${baseUrl ? ` (${baseUrl})` : ''}, or to turn on auto-update there. It takes about a minute. ` +
      `Alternatively run "${update}" on the device.`
    )
  }
  return (
    `Daemon version too old: "${device}" has ${version ?? 'an unknown version'}, ${tool} needs at least ${min}. ` +
    `Please update: run "${update}" on the device (keeps the token). Via run_command use this, so the daemon restart ` +
    `does not abort the update: systemd-run --user --collect bash -c '${update}'`
  )
}

const MAX_STRING = 200
// Felder aus dem Request-Kontext des SDK. Landen sie versehentlich in den Argumenten, gehören sie nie ins Log
// (requestInfo enthält die HTTP-Header mit dem Bearer-Token).
const INTERNAL_KEYS = new Set(['requestInfo', 'authInfo', 'signal', 'sendNotification', 'sendRequest', 'requestId', '_meta', 'headers', 'authorization'])
// Inhalte, die nur mit ihrer Länge ins Audit-Log gehören.
const CONTENT_KEYS = new Set(['content'])

function trimString(value: string) {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (+${value.length - MAX_STRING} chars)` : value
}

// Argumente fürs Audit-Log: lange Strings gekürzt, Dateiinhalte nur als Länge.
export function sanitizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (INTERNAL_KEYS.has(key)) continue
    if (CONTENT_KEYS.has(key) && typeof value === 'string') out[key] = `<${value.length} chars>`
    else if (typeof value === 'string') out[key] = trimString(value)
    else if (Array.isArray(value)) out[key] = value.slice(0, 50).map((v) => (typeof v === 'string' ? trimString(v) : v))
    else if (value && typeof value === 'object') out[key] = '<object>'
    else out[key] = value
  }
  return out
}

export const short = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max)}…` : value).replace(/\s+/g, ' ')
