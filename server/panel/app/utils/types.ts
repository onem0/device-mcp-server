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

export interface ServerInfo {
  version: string
  baseUrl: string
  mcpUrl: string
  uninstallCommand: string
  heartbeatTimeoutSeconds: number
}
