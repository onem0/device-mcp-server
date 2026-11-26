import { sql } from 'drizzle-orm'
import { boolean, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './columns.js'

export const devices = pgTable(
  'devices',
  {
    id: id(),
    name: text('name').notNull(),
    // SHA-256 of the device token. The token itself is shown only once in the panel.
    tokenHash: text('token_hash').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    // Read-only: run_command, write_file, edit_file as well as session start and input are blocked.
    readOnly: boolean('read_only').notNull().default(false),
    // The server triggers a daemon update itself as soon as the device is connected with an older version.
    // Off: updates only by a click in the panel.
    autoUpdate: boolean('auto_update').notNull().default(false),
    // Reported by the daemon on every connection.
    hostname: text('hostname'),
    os: text('os'),
    kernel: text('kernel'),
    arch: text('arch'),
    username: text('username'),
    homeDir: text('home_dir'),
    daemonVersion: text('daemon_version'),
    lastSeenAt: tstz('last_seen_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('devices_name_lower_unique').on(sql`lower(${t.name})`),
    uniqueIndex('devices_token_hash_unique').on(t.tokenHash),
  ],
)
