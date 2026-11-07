import { count, desc, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { auditLog } from '../db/schema/index.js'

export type AuditEntry = typeof auditLog.$inferSelect

export async function logAudit(entry: {
  deviceId: string
  tool: string
  command: string
  jobId?: string
  status: string
  exitCode?: number | null
  durationMs?: number | null
  error?: string | null
}) {
  const [row] = await db
    .insert(auditLog)
    .values({ ...entry, command: entry.command.slice(0, 10_000), error: entry.error?.slice(0, 2_000) ?? null })
    .returning({ id: auditLog.id })
  return row!.id
}

export const finishAudit = (id: string, result: { status: string; exitCode?: number | null; durationMs?: number | null; error?: string | null }) =>
  db
    .update(auditLog)
    .set({ ...result, error: result.error?.slice(0, 2_000) ?? null })
    .where(eq(auditLog.id, id))

// Misst Dauer und Ausgang eines kurzen Tool-Aufrufs (read_file, write_file, kill_job) und protokolliert ihn.
export async function audited<T>(base: { deviceId: string; tool: string; command: string }, fn: () => Promise<T>): Promise<T> {
  const started = Date.now()
  const id = await logAudit({ ...base, status: 'running' })
  try {
    const result = await fn()
    await finishAudit(id, { status: 'ok', durationMs: Date.now() - started })
    return result
  } catch (err) {
    await finishAudit(id, { status: 'error', durationMs: Date.now() - started, error: (err as Error).message })
    throw err
  }
}

export async function listAudit(deviceId: string, limit: number, offset: number) {
  const [entries, [total]] = await Promise.all([
    db.select().from(auditLog).where(eq(auditLog.deviceId, deviceId)).orderBy(desc(auditLog.createdAt)).limit(limit).offset(offset),
    db.select({ n: count() }).from(auditLog).where(eq(auditLog.deviceId, deviceId)),
  ])
  return { entries, total: total?.n ?? 0 }
}
