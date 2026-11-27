import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { claudeRuns, jobs } from '../db/schema/index.js'

export type ClaudeRunRow = typeof claudeRuns.$inferSelect
export type JobRowForRun = typeof jobs.$inferSelect

export const createClaudeRun = (run: typeof claudeRuns.$inferInsert) => db.insert(claudeRuns).values(run)

// The daemon resolves ~ and relative paths; the absolute directory is what claude --resume needs.
export const setClaudeRunCwd = (jobId: string, cwd: string) => db.update(claudeRuns).set({ cwd }).where(eq(claudeRuns.jobId, jobId))

export async function getClaudeRun(deviceId: string, jobId: string) {
  const [row] = await db
    .select({ run: claudeRuns, job: jobs })
    .from(claudeRuns)
    .innerJoin(jobs, eq(jobs.id, claudeRuns.jobId))
    .where(and(eq(claudeRuns.deviceId, deviceId), eq(claudeRuns.jobId, jobId)))
  return row ?? null
}

export const recentClaudeRuns = (deviceId: string, limit = 15) =>
  db
    .select({ run: claudeRuns, job: jobs })
    .from(claudeRuns)
    .innerJoin(jobs, eq(jobs.id, claudeRuns.jobId))
    .where(eq(claudeRuns.deviceId, deviceId))
    .orderBy(desc(claudeRuns.createdAt))
    .limit(limit)

// The latest run of a conversation on the device: its cwd is where claude --resume finds it, and it must not still run.
export async function latestRunOfSession(deviceId: string, sessionId: string) {
  const [row] = await db
    .select({ run: claudeRuns, job: jobs })
    .from(claudeRuns)
    .innerJoin(jobs, eq(jobs.id, claudeRuns.jobId))
    .where(and(eq(claudeRuns.deviceId, deviceId), eq(claudeRuns.sessionId, sessionId)))
    .orderBy(desc(claudeRuns.createdAt))
    .limit(1)
  return row ?? null
}
