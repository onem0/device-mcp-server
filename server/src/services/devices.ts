import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { devices } from '../db/schema/index.js'
import { ApiError, isUniqueViolation, notFound } from './errors.js'
import type { DaemonInfo } from './protocol.js'
import { hashToken, newToken } from './tokens.js'

export type Device = typeof devices.$inferSelect

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const newDeviceToken = () => newToken('dmcp_')

const nameTaken = () => new ApiError(409, 'NAME_TAKEN', 'Ein Gerät mit diesem Namen gibt es schon.')

export const listDevices = () => db.select().from(devices).orderBy(asc(sql`lower(${devices.name})`))

export async function getDevice(id: string) {
  if (!UUID_RE.test(id)) throw notFound('Das Gerät')
  const [device] = await db.select().from(devices).where(eq(devices.id, id))
  if (!device) throw notFound('Das Gerät')
  return device
}

// Für die MCP-Tools: Claude nennt ein Gerät beim Namen (ohne Groß-/Kleinschreibung) oder per ID.
export async function findDeviceByRef(ref: string) {
  const value = ref.trim()
  if (UUID_RE.test(value)) {
    const [byId] = await db.select().from(devices).where(eq(devices.id, value))
    if (byId) return byId
  }
  const [byName] = await db.select().from(devices).where(sql`lower(${devices.name}) = lower(${value})`)
  return byName ?? null
}

export async function findDeviceByToken(token: string) {
  const [device] = await db.select().from(devices).where(eq(devices.tokenHash, hashToken(token)))
  return device ?? null
}

export async function createDevice(name: string) {
  const token = newDeviceToken()
  try {
    const [device] = await db.insert(devices).values({ name, tokenHash: hashToken(token) }).returning()
    return { device: device!, token }
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken()
    throw err
  }
}

export async function updateDevice(id: string, patch: { name?: string; enabled?: boolean }) {
  await getDevice(id)
  try {
    const [device] = await db.update(devices).set(patch).where(eq(devices.id, id)).returning()
    return device!
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken()
    throw err
  }
}

export async function regenerateToken(id: string) {
  await getDevice(id)
  const token = newDeviceToken()
  const [device] = await db.update(devices).set({ tokenHash: hashToken(token) }).where(eq(devices.id, id)).returning()
  return { device: device!, token }
}

export async function deleteDevice(id: string) {
  await getDevice(id)
  await db.delete(devices).where(eq(devices.id, id))
}

export const saveDeviceInfo = (id: string, info: DaemonInfo, seenAt: Date) =>
  db
    .update(devices)
    .set({
      hostname: info.hostname,
      os: info.os,
      kernel: info.kernel,
      arch: info.arch,
      username: info.username,
      homeDir: info.homeDir,
      daemonVersion: info.version,
      lastSeenAt: seenAt,
    })
    .where(eq(devices.id, id))

export const touchLastSeen = (id: string, seenAt: Date) =>
  db.update(devices).set({ lastSeenAt: seenAt, updatedAt: sql`${devices.updatedAt}` }).where(eq(devices.id, id))
