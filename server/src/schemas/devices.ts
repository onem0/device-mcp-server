import { z } from 'zod/v4'
import type { AuditEntry } from '../services/audit.js'
import type { Device } from '../services/devices.js'
import { hub } from '../services/hub.js'
import { iso, isoOrNull } from './common.js'

// Claude spricht Geräte beim Namen an, deshalb ohne Leerzeichen.
export const deviceName = z
  .string()
  .trim()
  .min(1, 'Gib einen Namen ein.')
  .max(64, 'Höchstens 64 Zeichen.')
  .regex(/^[\p{L}\p{N}._-]+$/u, 'Erlaubt sind Buchstaben, Ziffern, Punkt, Binde- und Unterstrich, keine Leerzeichen.')

export const device = z.object({
  id: z.uuid(),
  name: z.string(),
  enabled: z.boolean(),
  online: z.boolean(),
  connectedAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  hostname: z.string().nullable(),
  os: z.string().nullable(),
  kernel: z.string().nullable(),
  arch: z.string().nullable(),
  username: z.string().nullable(),
  homeDir: z.string().nullable(),
  daemonVersion: z.string().nullable(),
  createdAt: z.string(),
})

export const deviceWithToken = z.object({
  device,
  token: z.string(),
  installCommand: z.string(),
})

export const auditEntry = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  tool: z.string(),
  command: z.string(),
  jobId: z.string().nullable(),
  status: z.string(),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  error: z.string().nullable(),
})

export function toDevice(d: Device): z.infer<typeof device> {
  const conn = hub.connection(d.id)
  return {
    id: d.id,
    name: d.name,
    enabled: d.enabled,
    online: conn !== null,
    connectedAt: conn ? iso(conn.connectedAt) : null,
    lastSeenAt: conn ? iso(conn.lastSeen) : isoOrNull(d.lastSeenAt),
    hostname: d.hostname,
    os: d.os,
    kernel: d.kernel,
    arch: d.arch,
    username: d.username,
    homeDir: d.homeDir,
    daemonVersion: d.daemonVersion,
    createdAt: iso(d.createdAt),
  }
}

export const toAuditEntry = (e: AuditEntry): z.infer<typeof auditEntry> => ({
  id: e.id,
  createdAt: iso(e.createdAt),
  tool: e.tool,
  command: e.command,
  jobId: e.jobId,
  status: e.status,
  exitCode: e.exitCode,
  durationMs: e.durationMs,
  error: e.error,
})
