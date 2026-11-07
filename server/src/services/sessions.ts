import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { panelSessions } from '../db/schema/index.js'
import { env } from '../env.js'
import { hashToken, newToken } from './tokens.js'

const ttlMs = () => env.SESSION_TTL_HOURS * 3_600_000

export async function createSession(meta: { userAgent?: string; ip?: string }) {
  const token = newToken()
  await db.insert(panelSessions).values({
    tokenHash: hashToken(token),
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip ?? null,
    expiresAt: new Date(Date.now() + ttlMs()),
  })
  // Abgelaufene Sitzungen bei Gelegenheit aufräumen.
  await db.delete(panelSessions).where(lt(panelSessions.expiresAt, new Date()))
  return token
}

// Gleitende Gültigkeit: Jede Nutzung verlängert die Sitzung.
export async function resolveSession(token: string) {
  const tokenHash = hashToken(token)
  const now = new Date()
  const [row] = await db
    .update(panelSessions)
    .set({ lastUsedAt: now, expiresAt: new Date(now.getTime() + ttlMs()) })
    .where(and(eq(panelSessions.tokenHash, tokenHash), gt(panelSessions.expiresAt, now)))
    .returning({ tokenHash: panelSessions.tokenHash })
  return row ?? null
}

export const deleteSession = (token: string) => db.delete(panelSessions).where(eq(panelSessions.tokenHash, hashToken(token)))
