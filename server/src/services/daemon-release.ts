import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { env } from '../env.js'

// daemon/build.ts schreibt das Manifest neben die Binaries: Version und Prüfsummen der entpackten Dateien.
export interface DaemonManifest {
  version: string
  binaries: Record<string, { sha256: string; size: number }>
}

const file = () => path.join(env.DAEMON_DIST_DIR, 'manifest.json')

let cache: { mtimeMs: number; manifest: DaemonManifest | null } | null = null

// Synchron und nach mtime gecacht: wird für jede Geräteliste im Panel gebraucht.
export function daemonManifest(): DaemonManifest | null {
  let mtimeMs: number
  try {
    mtimeMs = statSync(file()).mtimeMs
  } catch {
    // Kein Manifest (z. B. Entwicklung ohne gebauten Daemon): keine Updates.
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
    // Kaputtes Manifest zählt wie keins.
  }
  cache = { mtimeMs, manifest }
  return manifest
}

export const latestDaemonVersion = () => daemonManifest()?.version ?? null
