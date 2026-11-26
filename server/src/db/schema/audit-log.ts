import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id } from './columns.js'
import { devices } from './devices.js'

// One entry per MCP tool call. device_id is empty for calls without a device (list_devices) or with an unknown device.
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    // Short form for the table, e.g. the command or the path.
    command: text('command').notNull(),
    // Arguments of the call, long strings truncated, file contents only as a length.
    args: jsonb('args'),
    jobId: text('job_id'),
    // running, ok, error or the final status of the job (exited, killed, timeout, failed, lost).
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
