// Pure helper functions for the MCP tools, without database and without environment (testable).

// From which daemon version on a method exists. Older daemons do not know it.
export const DAEMON_FEATURES = {
  edit_file: '0.2.0',
  read_file_base64: '0.2.0',
  sessions: '0.2.0',
} as const

// From this version on the daemon knows the "update" method: the server can update it from the panel.
export const REMOTE_UPDATE_SINCE = '0.4.0'

// These tools are blocked on devices set to "read-only".
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

// available: the daemon is older than the one the server ships and can be updated from the panel.
// manual: it is too old for that, the install script has to be run by hand once.
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
// Fields from the SDK's request context. If they end up in the arguments by accident, they never belong in the log
// (requestInfo contains the HTTP headers with the bearer token).
const INTERNAL_KEYS = new Set(['requestInfo', 'authInfo', 'signal', 'sendNotification', 'sendRequest', 'requestId', '_meta', 'headers', 'authorization'])
// Contents that go into the audit log only as their length.
const CONTENT_KEYS = new Set(['content'])

function trimString(value: string) {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (+${value.length - MAX_STRING} chars)` : value
}

// Arguments for the audit log: long strings truncated, file contents only as a length.
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
