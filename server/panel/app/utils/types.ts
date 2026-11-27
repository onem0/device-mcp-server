export interface Device {
  id: string
  name: string
  enabled: boolean
  readOnly: boolean
  online: boolean
  connectedAt: string | null
  lastSeenAt: string | null
  hostname: string | null
  os: string | null
  kernel: string | null
  arch: string | null
  username: string | null
  homeDir: string | null
  daemonVersion: string | null
  // available: older than the server's daemon and updatable from the panel. manual: too old for that, run the install script again.
  daemonUpdate: 'available' | 'manual' | null
  autoUpdate: boolean
  updateStatus: { state: 'running' | 'restarting' | 'failed'; target: string | null; message: string | null } | null
  createdAt: string
}

export interface DeviceWithToken {
  device: Device
  token: string
  installCommand: string
}

export interface AuditEntry {
  id: string
  createdAt: string
  deviceId: string | null
  deviceName: string | null
  tool: string
  command: string
  args: Record<string, unknown> | null
  jobId: string | null
  status: string
  exitCode: number | null
  durationMs: number | null
  error: string | null
}

// A note in the memory. deviceId null: global, about the user or across devices.
export interface Memory {
  id: string
  deviceId: string | null
  deviceName: string | null
  title: string
  content: string
  path: string | null
  tags: string[]
  pinned: boolean
  // Who wrote the last version.
  source: 'claude' | 'panel' | string
  useCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MemoryDraft {
  deviceId: string | null
  title: string
  content: string
  path: string | null
  tags: string[]
  pinned: boolean
}

export interface ServerInfo {
  version: string
  baseUrl: string
  mcpUrl: string
  updateCommand: string
  uninstallCommand: string
  daemonVersion: string | null
  daemonReleaseUrl: string
  heartbeatTimeoutSeconds: number
}
