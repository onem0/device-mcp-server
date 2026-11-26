import type { FastifyBaseLogger } from 'fastify'
import { env } from '../env.js'

// The daemon is not built or hosted by this server. Its binaries are GitHub releases of the daemon repo
// (DAEMON_RELEASE_URL): each release carries device-mcp-<platform>-<arch>.gz and manifest.json with the
// version and the checksums of the unpacked binaries. Install script and daemons download from there.
// The server only needs to know which version is the latest, to offer updates in the panel.
export interface DaemonManifest {
  version: string
  binaries: Record<string, { sha256: string; size: number }>
}

const REFRESH_EVERY_MS = 10 * 60_000
const FETCH_TIMEOUT_MS = 15_000

let manifest: DaemonManifest | null = null
let fetchedAt = 0
let inflight: Promise<void> | null = null
let log: FastifyBaseLogger | null = null
let onNewVersion: ((version: string) => void) | null = null

export const releaseUrl = () => env.DAEMON_RELEASE_URL
export const latestManifestUrl = () => `${releaseUrl()}/latest/download/manifest.json`
// A binary of exactly that version, so that manifest and binary always belong together.
export const binaryUrl = (version: string, file: string) => `${releaseUrl()}/download/v${version}/${file}`

// Synchronous: needed for every device list in the panel. null until the first fetch succeeded.
export const daemonManifest = () => manifest
export const latestDaemonVersion = () => manifest?.version ?? null

async function fetchManifest() {
  const res = await fetch(latestManifestUrl(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as Partial<DaemonManifest>
  if (typeof data.version !== 'string' || !data.binaries || typeof data.binaries !== 'object') throw new Error('unexpected manifest')
  return { version: data.version, binaries: data.binaries } satisfies DaemonManifest
}

// On failure the last known manifest stays; GitHub being unreachable must not hide a known update.
export function refreshDaemonRelease(): Promise<void> {
  inflight ??= fetchManifest()
    .then((next) => {
      const previous = manifest?.version
      manifest = next
      if (previous !== next.version) {
        log?.info({ version: next.version, previous: previous ?? null }, 'Latest daemon release')
        onNewVersion?.(next.version)
      }
    })
    .catch((err: Error) => {
      log?.warn({ url: latestManifestUrl(), err: err.message }, 'Could not fetch the latest daemon release')
    })
    .finally(() => {
      fetchedAt = Date.now()
      inflight = null
    })
  return inflight
}

// For requests that want a fresh answer (the panel was just opened) without hitting GitHub on every call.
export function refreshIfStale(maxAgeMs: number) {
  if (Date.now() - fetchedAt > maxAgeMs) void refreshDaemonRelease()
}

export function watchDaemonRelease(logger: FastifyBaseLogger, newVersion: (version: string) => void) {
  log = logger
  onNewVersion = newVersion
  void refreshDaemonRelease()
  const timer = setInterval(() => void refreshDaemonRelease(), REFRESH_EVERY_MS)
  timer.unref()
  return () => clearInterval(timer)
}
