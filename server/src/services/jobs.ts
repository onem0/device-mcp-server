import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { auditLog, jobs } from '../db/schema/index.js'
import type { JobSummary } from './protocol.js'

export type JobRow = typeof jobs.$inferSelect

export const createJob = (job: { id: string; deviceId: string; command: string; cwd?: string; background: boolean; timeoutSeconds: number | null }) =>
  db.insert(jobs).values({ ...job, cwd: job.cwd ?? null })

export async function getJob(deviceId: string, jobId: string) {
  const [row] = await db.select().from(jobs).where(and(eq(jobs.deviceId, deviceId), eq(jobs.id, jobId)))
  return row ?? null
}

export const recentJobs = (deviceId: string, limit = 20) =>
  db.select().from(jobs).where(eq(jobs.deviceId, deviceId)).orderBy(desc(jobs.startedAt)).limit(limit)

export const runningJobs = (deviceId: string) =>
  db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.deviceId, deviceId), eq(jobs.status, 'running')))

// Übernimmt den Endstand aus dem Daemon in Job und Audit-Eintrag. Nur Jobs des eigenen Geräts.
export async function saveJobResult(deviceId: string, s: Pick<JobSummary, 'id' | 'status' | 'exitCode' | 'signal' | 'error' | 'finishedAt' | 'durationMs'>) {
  const [row] = await db
    .update(jobs)
    .set({
      status: s.status,
      exitCode: s.exitCode,
      signal: s.signal,
      error: s.error,
      finishedAt: s.finishedAt ? new Date(s.finishedAt) : new Date(),
      durationMs: s.durationMs,
    })
    .where(and(eq(jobs.id, s.id), eq(jobs.deviceId, deviceId)))
    .returning({ id: jobs.id })
  if (!row) return false
  await db
    .update(auditLog)
    .set({ status: s.status, exitCode: s.exitCode, durationMs: s.durationMs, error: s.error })
    .where(and(eq(auditLog.jobId, s.id), eq(auditLog.deviceId, deviceId)))
  return true
}

export const rowToSummary = (row: JobRow): JobSummary => ({
  id: row.id,
  command: row.command,
  cwd: row.cwd ?? '',
  status: row.status,
  exitCode: row.exitCode,
  signal: row.signal,
  error: row.error,
  startedAt: row.startedAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? null,
  durationMs: row.durationMs,
  timeoutMs: row.timeoutSeconds ? row.timeoutSeconds * 1000 : null,
  outputLines: -1,
  outputBytes: -1,
  outputTruncated: false,
})
