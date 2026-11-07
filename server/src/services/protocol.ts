// Nachrichten zwischen Server und Daemon über /daemon/ws (JSON, eine Nachricht pro Frame).
// Gegenstück: daemon/src/protocol.ts. Änderungen immer in beiden Dateien nachziehen.

import type { JobStatus } from '../db/schema/columns.js'

export const PROTOCOL_VERSION = 1

// Close-Codes, mit denen der Server eine Daemon-Verbindung beendet.
export const CloseCode = {
  BadMessage: 4400,
  InvalidToken: 4401,
  Disabled: 4403,
  Replaced: 4409,
  HelloTimeout: 4408,
  HeartbeatTimeout: 4000,
  Shutdown: 1001,
} as const

export interface DaemonInfo {
  hostname: string
  os: string
  kernel: string
  arch: string
  username: string
  homeDir: string
  version: string
}

export interface JobSummary {
  id: string
  command: string
  cwd: string
  status: JobStatus
  exitCode: number | null
  signal: string | null
  error: string | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  timeoutMs: number | null
  outputLines: number
  outputBytes: number
  outputTruncated: boolean
}

// Daemon → Server
export type DaemonMessage =
  | { type: 'hello'; protocol: number; token: string; info: DaemonInfo; jobs: JobSummary[] }
  | { type: 'heartbeat' }
  | { type: 'response'; id: number; ok: true; result: unknown }
  | { type: 'response'; id: number; ok: false; error: { message: string; code?: string } }
  | { type: 'job_exit'; job: JobSummary }

// Server → Daemon
export type ServerMessage =
  | { type: 'welcome'; deviceId: string; name: string; heartbeatIntervalMs: number; heartbeatTimeoutMs: number }
  | { type: 'heartbeat_ack' }
  | { type: 'request'; id: number; method: string; params: unknown }

export interface OutputChunk {
  text: string
  fromLine: number
  toLine: number
  totalLines: number
  // Nur bei mode=headtail: ausgelassene Zeilen zwischen Anfang und Ende.
  omittedLines?: number
  omittedFrom?: number
  tailText?: string
  tailFromLine?: number
  truncatedChars: boolean
  job: JobSummary
}

export type ReadFileResult =
  | {
      kind: 'text'
      path: string
      size: number
      text: string
      fromLine: number
      toLine: number
      totalLines: number | null
      hasMore: boolean
      truncatedChars: boolean
    }
  | { kind: 'image'; path: string; size: number; mimeType: string; data: string }
  | { kind: 'binary'; path: string; size: number; mimeType: string | null }

export interface WriteFileResult {
  path: string
  bytesWritten: number
  size: number
  created: boolean
}
