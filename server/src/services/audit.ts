import { count, desc, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { auditLog, devices } from '../db/schema/index.js'

export type AuditEntry = typeof auditLog.$inferSelect & { deviceName: string | null }

export async function logAudit(entry: {
  deviceId: string | null
  tool: string
  command: string
  args?: Record<string, unknown>
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

// Neueste zuerst. Ohne deviceId über alle Geräte (auch Aufrufe ohne Gerät wie list_devices).
export async function listAudit(filter: { deviceId?: string }, limit: number, offset: number) {
  const where = filter.deviceId ? eq(auditLog.deviceId, filter.deviceId) : undefined
  const [rows, [total]] = await Promise.all([
    db
      .select({ entry: auditLog, deviceName: devices.name })
      .from(auditLog)
      .leftJoin(devices, eq(auditLog.deviceId, devices.id))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(auditLog).where(where),
  ])
  return { entries: rows.map((r) => ({ ...r.entry, deviceName: r.deviceName })) as AuditEntry[], total: total?.n ?? 0 }
}
