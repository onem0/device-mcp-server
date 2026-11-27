import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/client.js'
import { devices, memories } from '../db/schema/index.js'
import { ApiError, notFound } from './errors.js'
import { MEMORY_LIMITS, escapeLike, normalizeTags, queryWords } from './memory-text.js'

export { MEMORY_LIMITS } from './memory-text.js'

export type MemoryRow = typeof memories.$inferSelect
export type Memory = MemoryRow & { deviceName: string | null }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Tools whose path argument counts as "used" for the list of frequent paths.
const PATH_TOOLS = ['read_file', 'write_file', 'edit_file']

function wordMatch(word: string): SQL {
  const pattern = `%${escapeLike(word)}%`
  return or(
    ilike(memories.title, pattern),
    ilike(memories.content, pattern),
    ilike(memories.path, pattern),
    sql`array_to_string(${memories.tags}, ' ') ilike ${pattern}`,
  )!
}

// scope: a device (its notes plus the global ones), "global" (only global ones) or all notes.
export type MemoryScope = { deviceId: string } | 'global' | 'all'

function scopeWhere(scope: MemoryScope): SQL | undefined {
  if (scope === 'all') return undefined
  if (scope === 'global') return isNull(memories.deviceId)
  return or(eq(memories.deviceId, scope.deviceId), isNull(memories.deviceId))
}

const withDevice = () => db.select({ memory: memories, deviceName: devices.name }).from(memories).leftJoin(devices, eq(memories.deviceId, devices.id))
const flatten = (rows: { memory: MemoryRow; deviceName: string | null }[]): Memory[] => rows.map((r) => ({ ...r.memory, deviceName: r.deviceName }))

export async function searchMemories(opts: { query?: string; scope: MemoryScope; tag?: string; limit?: number; onlyDevice?: string }) {
  const words = queryWords(opts.query)
  // Any word is enough to match: Claude often searches with several synonyms or in another language than the note.
  // Notes that match more of the words come first.
  const conditions: (SQL | undefined)[] = [scopeWhere(opts.scope), words.length ? or(...words.map(wordMatch)) : undefined]
  if (opts.onlyDevice) conditions.push(eq(memories.deviceId, opts.onlyDevice))
  const tag = normalizeTags(opts.tag ? [opts.tag] : undefined)?.[0]
  if (tag) conditions.push(sql`${tag} = any(${memories.tags})`)
  const where = and(...conditions)
  const sum = (parts: SQL[]) => (parts.length ? sql<number>`(${sql.join(parts, sql` + `)})` : sql<number>`0`)
  const wordHits = sum(words.map((w) => sql`(${wordMatch(w)})::int`))
  const titleHits = sum(words.map((w) => sql`(${memories.title} ilike ${`%${escapeLike(w)}%`})::int`))
  const [rows, [total]] = await Promise.all([
    withDevice()
      .where(where)
      .orderBy(desc(wordHits), desc(titleHits), desc(memories.pinned), desc(memories.updatedAt))
      .limit(opts.limit ?? 20),
    db.select({ n: count() }).from(memories).where(where),
  ])
  return { memories: flatten(rows), total: total?.n ?? 0, words }
}

// For the panel: everything, or the notes of one device (without the global ones), or only global ones.
export async function listMemories(filter: { deviceId?: string | null }, limit = 1000) {
  const where = filter.deviceId === undefined ? undefined : filter.deviceId === null ? isNull(memories.deviceId) : eq(memories.deviceId, filter.deviceId)
  return flatten(await withDevice().where(where).orderBy(desc(memories.pinned), desc(memories.updatedAt)).limit(limit))
}

// For the digest in the instructions and list_devices: pinned first, then the most recently changed; the formatter caps the text.
export const digestMemories = () => listMemories({}, 300)

export async function getMemory(id: string) {
  if (!UUID_RE.test(id)) throw notFound('Note')
  const [row] = await withDevice().where(eq(memories.id, id))
  if (!row) throw notFound('Note')
  return flatten([row])[0]!
}

export async function markUsed(ids: string[]) {
  if (!ids.length) return
  await db
    .update(memories)
    .set({ useCount: sql`${memories.useCount} + 1`, lastUsedAt: new Date(), updatedAt: sql`${memories.updatedAt}` })
    .where(inArray(memories.id, ids))
}

export interface MemoryInput {
  title?: string
  content?: string
  path?: string | null
  tags?: string[]
  pinned?: boolean
  // undefined: keep the scope; null: global; otherwise the device.
  deviceId?: string | null
}

function checkInput(input: MemoryInput) {
  if (input.title !== undefined && !input.title.trim()) throw new ApiError(400, 'BAD_REQUEST', 'The title must not be empty.')
}

const clean = (input: MemoryInput) => ({
  ...(input.title !== undefined ? { title: input.title.trim().slice(0, MEMORY_LIMITS.title) } : {}),
  ...(input.content !== undefined ? { content: input.content.slice(0, MEMORY_LIMITS.content) } : {}),
  ...(input.path !== undefined ? { path: input.path?.trim() ? input.path.trim().slice(0, MEMORY_LIMITS.path) : null } : {}),
  ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
  ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
  ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
})

export async function updateMemory(id: string, input: MemoryInput, source: 'claude' | 'panel') {
  checkInput(input)
  await getMemory(id)
  await db
    .update(memories)
    .set({ ...clean(input), source })
    .where(eq(memories.id, id))
  return getMemory(id)
}

export async function createMemory(input: MemoryInput & { title: string }, source: 'claude' | 'panel') {
  checkInput(input)
  const [row] = await db
    .insert(memories)
    .values({ ...clean(input), title: input.title.trim().slice(0, MEMORY_LIMITS.title), source })
    .returning({ id: memories.id })
  return getMemory(row!.id)
}

// memory_save without id: a note with the same title in the same scope is updated instead of duplicated.
export async function saveMemory(input: MemoryInput & { id?: string; title?: string }, source: 'claude' | 'panel') {
  if (input.id) return { memory: await updateMemory(input.id, input, source), action: 'updated' as const }
  if (!input.title) throw new ApiError(400, 'BAD_REQUEST', 'A new note needs a title.')
  const scope = input.deviceId ? eq(memories.deviceId, input.deviceId) : isNull(memories.deviceId)
  const [existing] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(scope, sql`lower(${memories.title}) = lower(${input.title.trim()})`))
    .orderBy(asc(memories.createdAt))
    .limit(1)
  if (existing) return { memory: await updateMemory(existing.id, input, source), action: 'replaced' as const }
  return { memory: await createMemory({ ...input, title: input.title }, source), action: 'created' as const }
}

export async function deleteMemory(id: string) {
  const memory = await getMemory(id)
  await db.delete(memories).where(eq(memories.id, id))
  return memory
}

// Number of notes per device; key null = global.
export async function memoryCounts() {
  const rows = await db.select({ deviceId: memories.deviceId, n: count() }).from(memories).groupBy(memories.deviceId)
  return new Map(rows.map((r) => [r.deviceId, r.n]))
}

export interface FrequentPath {
  path: string
  uses: number
  lastUsedAt: Date
}

// Paths Claude read or changed most often on a device recently, from the audit log. Filled without anyone saving notes.
export async function frequentPaths(deviceId: string, opts: { days?: number; limit?: number; words?: string[] } = {}): Promise<FrequentPath[]> {
  // Like the note search: a path matching any of the words counts.
  const words = opts.words ?? []
  const filter = words.length ? sql`and (${sql.join(words.map((w) => sql`args->>'path' ilike ${`%${escapeLike(w)}%`}`), sql` or `)})` : sql``
  const result = await db.execute<{ path: string; uses: string; last_used_at: Date }>(sql`
    select args->>'path' as path, count(*) as uses, max(created_at) as last_used_at
    from audit_log
    where device_id = ${deviceId}
      and tool in (${sql.join(
        PATH_TOOLS.map((t) => sql`${t}`),
        sql`, `,
      )})
      and status <> 'error'
      and created_at > now() - make_interval(days => ${opts.days ?? 30})
      and args ? 'path'
      ${filter}
    group by 1
    order by count(*) desc, max(created_at) desc
    limit ${opts.limit ?? 10}`)
  return result.rows.map((r) => ({ path: r.path, uses: Number(r.uses), lastUsedAt: new Date(r.last_used_at) }))
}
