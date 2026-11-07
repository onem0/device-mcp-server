import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod/v4'

// Lokal liegt die .env im Projektordner oder eine Ebene höher (neben der docker-compose.yml).
// Im Container kommen alle Werte aus der Compose-Datei.
if (process.env.NODE_ENV !== 'test') {
  const file = ['.env', '../.env'].find((f) => existsSync(f))
  if (file) process.loadEnvFile(file)
}

// Compose setzt nicht gesetzte Variablen als leeren String, das soll wie "fehlt" zählen.
const blankAsUndefined = (v: unknown) => (v === '' ? undefined : v)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankAsUndefined, schema.optional())
const withDefault = <T extends z.ZodType>(schema: T, fallback: z.input<T>) =>
  z.preprocess(blankAsUndefined, schema.default(fallback as never))

// Zahl: so vielen Proxy-Hops vertrauen (Standard 1 = Traefik, hinter Cloudflare 2),
// true: jedem Proxy glauben (nur wenn niemand den Server direkt erreicht), sonst eine Liste von IPs/CIDRs.
const trustProxy = z.preprocess(
  (v) => {
    if (v === undefined || v === '') return 1
    if (v === 'true' || v === 'false') return v === 'true'
    if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v)
    return v
  },
  z.union([z.boolean(), z.number().int().min(1), z.string().min(1)]),
)

const schema = z.object({
  NODE_ENV: withDefault(z.string(), 'development'),
  HOST: withDefault(z.string(), '0.0.0.0'),
  PORT: withDefault(z.coerce.number().int().min(1).max(65535), 3000),
  TRUST_PROXY: trustProxy,
  LOG_LEVEL: withDefault(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']), 'info'),
  DATABASE_URL: z.string({ error: 'DATABASE_URL is missing.' }).min(1, 'DATABASE_URL is missing.'),
  PUBLIC_URL: optional(z.url({ error: 'PUBLIC_URL must be a URL, e.g. https://mcp.example.com.' }).transform((v) => v.replace(/\/+$/, ''))),
  MCP_TOKEN: z.string({ error: 'MCP_TOKEN is missing.' }).min(32, 'MCP_TOKEN needs at least 32 characters (openssl rand -base64 32).'),
  PANEL_PASSWORD: z.string({ error: 'PANEL_PASSWORD is missing.' }).min(12, 'PANEL_PASSWORD needs at least 12 characters.'),
  SESSION_TTL_HOURS: withDefault(z.coerce.number().int().positive(), 168),
  // Obergrenze ab Anmeldung, auch wenn die Sitzung ständig genutzt wird.
  SESSION_MAX_DAYS: withDefault(z.coerce.number().int().positive(), 30),
  HEARTBEAT_INTERVAL_SECONDS: withDefault(z.coerce.number().int().min(5).max(300), 15),
  HEARTBEAT_TIMEOUT_SECONDS: withDefault(z.coerce.number().int().min(10).max(900), 45),
  DAEMON_DIST_DIR: withDefault(z.string(), path.resolve(import.meta.dirname, '../../daemon/dist')),
  PANEL_DIST_DIR: withDefault(z.string(), path.resolve(import.meta.dirname, '../panel/.output/public')),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Configuration incomplete:')
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  process.exit(1)
}

if (parsed.data.HEARTBEAT_TIMEOUT_SECONDS <= parsed.data.HEARTBEAT_INTERVAL_SECONDS) {
  console.error('HEARTBEAT_TIMEOUT_SECONDS must be greater than HEARTBEAT_INTERVAL_SECONDS.')
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
