export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export const notFound = (what = 'Entry') => new ApiError(404, 'NOT_FOUND', `${what} not found.`)

// Postgres meldet eine verletzte Unique-Bedingung mit 23505. Drizzle hängt den Treiberfehler an cause.
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}
