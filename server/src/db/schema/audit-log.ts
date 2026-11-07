import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id } from './columns.js'
import { devices } from './devices.js'

// Ein Eintrag pro Tool-Aufruf, der auf dem Gerät etwas ausführt, liest oder schreibt.
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    command: text('command').notNull(),
    jobId: text('job_id'),
    // running, ok, error oder der Endstatus des Jobs (exited, killed, timeout, failed, lost).
    status: text('status').notNull(),
    exitCode: integer('exit_code'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_device_created_idx').on(t.deviceId, t.createdAt), index('audit_log_job_idx').on(t.jobId)],
)
