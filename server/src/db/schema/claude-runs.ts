import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt } from './columns.js'
import { devices } from './devices.js'
import { jobs } from './jobs.js'

// A Claude Code run (claude_code_start) is a job on the device. This row adds what the job does not know:
// the conversation (session_id) it belongs to and the prompt.
export const claudeRuns = pgTable(
  'claude_runs',
  {
    jobId: text('job_id')
      .primaryKey()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    // true: continued an earlier conversation (claude --resume).
    resumed: boolean('resumed').notNull().default(false),
    prompt: text('prompt').notNull(),
    cwd: text('cwd'),
    model: text('model'),
    permissionMode: text('permission_mode').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('claude_runs_device_created_idx').on(t.deviceId, t.createdAt), index('claude_runs_session_idx').on(t.sessionId)],
)
