import { sql } from 'drizzle-orm'
import { boolean, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tstz, updatedAt } from './columns.js'

export const devices = pgTable(
  'devices',
  {
    id: id(),
    name: text('name').notNull(),
    // SHA-256 des Geräte-Tokens. Der Token selbst wird nur einmal im Panel angezeigt.
    tokenHash: text('token_hash').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    // Nur lesen: run_command, write_file, edit_file sowie Session-Start und -Eingaben sind gesperrt.
    readOnly: boolean('read_only').notNull().default(false),
    // Der Server stößt ein Daemon-Update selbst an, sobald das Gerät mit einer älteren Version verbunden ist.
    // Aus: Updates nur per Klick im Panel.
    autoUpdate: boolean('auto_update').notNull().default(false),
    // Meldet der Daemon bei jeder Verbindung.
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
