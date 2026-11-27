// Messages between server and daemon over /daemon/ws (JSON, one message per frame).
// Counterpart: src/protocol.ts in the daemon repo (device-mcp-client). Always apply changes to both files.

import type { JobStatus } from '../db/schema/columns.js'

export const PROTOCOL_VERSION = 1

// Close codes with which the server ends a daemon connection.
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
  // Version of Claude Code found when the daemon started, null if there is none (since 0.6.0).
  claudeCode?: string | null
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
  // Only with mode=headtail: omitted lines between head and tail.
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
  // read_file with encoding=base64: a byte range of the file.
  | { kind: 'base64'; path: string; size: number; offset: number; length: number; data: string; hasMore: boolean }

export interface EditFileResult {
  path: string
  replacements: number
  inPlace: boolean
  crlf: boolean
  snippets: { fromLine: number; lines: string[] }[]
}

export interface SessionInfo {
  name: string
  created: string
  command: string
  dead: boolean
  exitStatus: number | null
  width: number
  height: number
  attached: boolean
  // Since 0.6.0: number of windows, and whether it is one of the user's own sessions (no mcp- prefix).
  windows?: number
  own?: boolean
}

export interface SessionStartResult {
  name: string
  cwd: string
  cols: number
  rows: number
  detachedFromDaemon: boolean
}

export interface SessionScreen {
  name: string
  text: string
  lines: number
  dead: boolean
  exitStatus: number | null
  command: string
  // Since 0.6.0. cursor: 1-based on the visible screen. alternateScreen: a full-screen program (editor, TUI) is in front.
  cursor?: { row: number; col: number }
  alternateScreen?: boolean
  own?: boolean
  // Highlighted text (selection, reverse video) is wrapped in ⟦…⟧.
  highlighted?: boolean
  // Only for session_wait and session_send with wait_for.
  wait?: SessionWaitInfo
}

export interface SessionWaitInfo {
  reason: 'pattern' | 'quiet' | 'shell' | 'exited' | 'timeout'
  waitedMs: number
  match: string | null
  // true: wait_for was matched against new output only; false: against the screen.
  outputMatched: boolean
}

// Claude Code (since 0.6.0).
export interface ClaudeInfo {
  path: string | null
  version: string | null
}

export interface ClaudeStartResult {
  job: JobSummary
  claude: ClaudeInfo
  sessionId: string
}

export interface ClaudeEvent {
  kind: 'init' | 'text' | 'tool' | 'error' | 'output' | 'note'
  text: string
  // From a subagent.
  sub?: boolean
}

export interface ClaudeResult {
  subtype: string
  isError: boolean
  text: string
  numTurns: number | null
  durationMs: number | null
  costUsd: number | null
  permissionDenials: string[]
  sessionId: string | null
}

export interface ClaudeEventsResult {
  job: JobSummary
  events: ClaudeEvent[]
  // Lines of the stream-json log: continue with offset = toLine.
  fromLine: number
  toLine: number
  totalLines: number
  hasMore: boolean
  result: ClaudeResult | null
}

// The daemon's response to "update" (since 0.4.0). installed: the new binary is on the device.
export type UpdateResult =
  | { status: 'current'; version: string }
  | { status: 'installed'; version: string; restart: 'now' | 'when_idle' | 'manual'; runningJobs: number }

export interface WriteFileResult {
  path: string
  bytesWritten: number
  size: number
  created: boolean
}
