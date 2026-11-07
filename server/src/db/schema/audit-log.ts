import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id } from './columns.js'
import { devices } from './devices.js'

// Ein Eintrag pro MCP-Tool-Aufruf. device_id ist leer bei Aufrufen ohne Gerät (list_devices) oder mit unbekanntem Gerät.
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    // Kurzfassung für die Tabelle, z. B. der Befehl oder der Pfad.
    command: text('command').notNull(),
    // Argumente des Aufrufs, lange Strings gekürzt, Dateiinhalte nur als Länge.
    args: jsonb('args'),
    jobId: text('job_id'),
    // running, ok, error oder der Endstatus des Jobs (exited, killed, timeout, failed, lost).
    status: text('status').notNull(),
    exitCode: integer('exit_code'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_device_created_idx').on(t.deviceId, t.createdAt),
    index('audit_log_created_idx').on(t.createdAt),
    index('audit_log_job_idx').on(t.jobId),
  ],
)
