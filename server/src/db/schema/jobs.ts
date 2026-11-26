import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { jobStatus, tstz } from './columns.js'
import { devices } from './devices.js'

// Every run_command is a job, even in the foreground. The output lives on the device, here only the state.
export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    command: text('command').notNull(),
    cwd: text('cwd'),
    background: boolean('background').notNull().default(false),
    timeoutSeconds: integer('timeout_seconds'),
    status: jobStatus('status').notNull().default('running'),
    exitCode: integer('exit_code'),
    signal: text('signal'),
    error: text('error'),
    startedAt: tstz('started_at').notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
    durationMs: integer('duration_ms'),
  },
  (t) => [index('jobs_device_started_idx').on(t.deviceId, t.startedAt)],
)
