import { z } from 'zod/v4'

export const ok = z.object({ ok: z.literal(true) })
export const idParams = z.object({ id: z.uuid() })
export const iso = (d: Date) => d.toISOString()
export const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null)
