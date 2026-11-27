import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './columns.js'
import { devices } from './devices.js'

// Notes Claude keeps across conversations: where things live on a device, how a service is run, the user's preferences.
// device_id empty: a global note that applies to every device.
export const memories = pgTable(
  'memories',
  {
    id: id(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    // The file or folder the note is about, if any.
    path: text('path'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    // Pinned notes go to Claude with every connection (server instructions and list_devices).
    pinned: boolean('pinned').notNull().default(false),
    // Who wrote the last version: claude (memory_save) or panel.
    source: text('source').notNull().default('claude'),
    // How often memory_search returned the note for a query.
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: tstz('last_used_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('memories_device_idx').on(t.deviceId), index('memories_title_idx').on(sql`lower(${t.title})`)],
)
