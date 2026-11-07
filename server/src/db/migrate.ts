import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from './client.js'

// Gilt für src/ (tsx) und dist/ (tsc): beide liegen eine Ebene unter server/.
export const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', 'drizzle')

export const runMigrations = () => migrate(db, { migrationsFolder: MIGRATIONS_DIR })
