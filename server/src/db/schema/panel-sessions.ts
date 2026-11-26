import { pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, tstz } from './columns.js'

export const panelSessions = pgTable('panel_sessions', {
  // SHA-256 of the cookie value.
  tokenHash: text('token_hash').primaryKey(),
  // Derived from PANEL_PASSWORD at login time. A new password invalidates all old sessions.
  passwordFingerprint: text('password_fingerprint').notNull().default(''),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: createdAt(),
  lastUsedAt: tstz('last_used_at').notNull().defaultNow(),
  expiresAt: tstz('expires_at').notNull(),
})
