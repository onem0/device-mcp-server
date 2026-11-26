import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { env } from '../env.js'

// daemon/build.ts writes the manifest next to the binaries: version and checksums of the unpacked files.
export interface DaemonManifest {
  version: string
  binaries: Record<string, { sha256: string; size: number }>
}

const file = () => path.join(env.DAEMON_DIST_DIR, 'manifest.json')

let cache: { mtimeMs: number; manifest: DaemonManifest | null } | null = null

// Synchronous and cached by mtime: needed for every device list in the panel.
export function daemonManifest(): DaemonManifest | null {
  let mtimeMs: number
  try {
    mtimeMs = statSync(file()).mtimeMs
  } catch {
    // No manifest (e.g. development without a built daemon): no updates.
    cache = null
    return null
  }
  if (cache?.mtimeMs === mtimeMs) return cache.manifest
  let manifest: DaemonManifest | null = null
  try {
    const data = JSON.parse(readFileSync(file(), 'utf8')) as Partial<DaemonManifest>
    if (typeof data.version === 'string' && data.binaries && typeof data.binaries === 'object') {
      manifest = { version: data.version, binaries: data.binaries }
    }
  } catch {
    // A broken manifest counts as none.
  }
  cache = { mtimeMs, manifest }
  return manifest
}

export const latestDaemonVersion = () => daemonManifest()?.version ?? null
