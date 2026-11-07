import { pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, tstz } from './columns.js'

export const panelSessions = pgTable('panel_sessions', {
  // SHA-256 des Cookie-Werts.
  tokenHash: text('token_hash').primaryKey(),
  // Abgeleitet vom PANEL_PASSWORD zur Anmeldezeit. Ein neues Passwort macht alle alten Sitzungen ungültig.
  passwordFingerprint: text('password_fingerprint').notNull().default(''),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: createdAt(),
  lastUsedAt: tstz('last_used_at').notNull().defaultNow(),
  expiresAt: tstz('expires_at').notNull(),
})
