import { pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, tstz } from './columns.js'

export const panelSessions = pgTable('panel_sessions', {
  // SHA-256 des Cookie-Werts.
  tokenHash: text('token_hash').primaryKey(),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: createdAt(),
  lastUsedAt: tstz('last_used_at').notNull().defaultNow(),
  expiresAt: tstz('expires_at').notNull(),
})
