import { z } from 'zod/v4'
import type { Memory } from '../services/memory.js'
import { MEMORY_LIMITS } from '../services/memory-text.js'
import { iso, isoOrNull } from './common.js'

export const memory = z.object({
  id: z.uuid(),
  // null: a global note.
  deviceId: z.uuid().nullable(),
  deviceName: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  path: z.string().nullable(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
  // Who wrote the last version: claude or panel.
  source: z.string(),
  useCount: z.number().int(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const memoryInput = z.object({
  deviceId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1, 'Enter a title.').max(MEMORY_LIMITS.title),
  content: z.string().max(MEMORY_LIMITS.content).optional(),
  path: z.string().max(MEMORY_LIMITS.path).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(MEMORY_LIMITS.tag)).max(MEMORY_LIMITS.tags).optional(),
  pinned: z.boolean().optional(),
})

export const toMemory = (m: Memory): z.infer<typeof memory> => ({
  id: m.id,
  deviceId: m.deviceId,
  deviceName: m.deviceName,
  title: m.title,
  content: m.content,
  path: m.path,
  tags: m.tags,
  pinned: m.pinned,
  source: m.source,
  useCount: m.useCount,
  lastUsedAt: isoOrNull(m.lastUsedAt),
  createdAt: iso(m.createdAt),
  updatedAt: iso(m.updatedAt),
})
