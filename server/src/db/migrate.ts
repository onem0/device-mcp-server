import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from './client.js'

// Holds for src/ (tsx) and dist/ (tsc): both sit one level below server/.
export const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', 'drizzle')

export const runMigrations = () => migrate(db, { migrationsFolder: MIGRATIONS_DIR })
