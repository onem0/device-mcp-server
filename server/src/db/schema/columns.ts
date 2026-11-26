import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core'

export const id = () => uuid('id').primaryKey().defaultRandom()
export const tstz = (name: string) => timestamp(name, { withTimezone: true })
export const createdAt = () => tstz('created_at').notNull().defaultNow()
export const updatedAt = () => tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date())

// running: runs on the device. lost: the daemon no longer knows the job (e.g. after a daemon restart).
export const JOB_STATUSES = ['running', 'exited', 'killed', 'timeout', 'failed', 'lost'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
export const jobStatus = pgEnum('job_status', JOB_STATUSES)
