// Pure helpers for the memory (no database), so they can be tested on their own.

export const MEMORY_LIMITS = { title: 200, content: 20_000, path: 4096, tags: 20, tag: 40 } as const

// Lower case, spaces to hyphens, without duplicates.
export function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined
  const out = tags
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MEMORY_LIMITS.tag))
    .filter(Boolean)
  return [...new Set(out)].slice(0, MEMORY_LIMITS.tags)
}

// Every word of a query must occur somewhere: title, content, path or tags.
export function queryWords(query: string | undefined) {
  return (query ?? '')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 12)
}

// For ILIKE: % and _ are literal characters in a search word.
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')
