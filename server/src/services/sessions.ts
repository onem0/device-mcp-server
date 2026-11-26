import { scryptSync } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { panelSessions } from '../db/schema/index.js'
import { env } from '../env.js'
import { hashToken, newToken } from './tokens.js'

const ttlMs = () => env.SESSION_TTL_HOURS * 3_600_000
const maxAgeMs = () => env.SESSION_MAX_DAYS * 86_400_000

// Derived slowly (scrypt) so that a database leak does not give the password away cheaply. Once per process.
const passwordFingerprint = scryptSync(env.PANEL_PASSWORD, 'device-mcp/panel-session/v1', 32).toString('hex')

export async function createSession(meta: { userAgent?: string; ip?: string }) {
  const token = newToken()
  await db.insert(panelSessions).values({
    tokenHash: hashToken(token),
    passwordFingerprint,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip ?? null,
    expiresAt: new Date(Date.now() + ttlMs()),
  })
  // Clean up expired sessions when the occasion arises.
  await db.delete(panelSessions).where(lt(panelSessions.expiresAt, new Date()))
  return token
}

// Sliding expiry: every use extends the session, at most until SESSION_MAX_DAYS after login.
export async function resolveSession(token: string) {
  const tokenHash = hashToken(token)
  const now = new Date()
  const [row] = await db
    .update(panelSessions)
    .set({ lastUsedAt: now, expiresAt: new Date(now.getTime() + ttlMs()) })
    .where(
      and(
        eq(panelSessions.tokenHash, tokenHash),
        gt(panelSessions.expiresAt, now),
        gt(panelSessions.createdAt, new Date(now.getTime() - maxAgeMs())),
        eq(panelSessions.passwordFingerprint, passwordFingerprint),
      ),
    )
    .returning({ tokenHash: panelSessions.tokenHash })
  return row ?? null
}

export const deleteSession = (token: string) => db.delete(panelSessions).where(eq(panelSessions.tokenHash, hashToken(token)))
