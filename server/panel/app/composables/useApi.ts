export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: { field: string; message: string }[] }
}

// All calls to the panel API under /v1. An expired session leads back to the login.
export async function api<T>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; query?: Record<string, unknown> } = {}) {
  try {
    return await $fetch<T>(`/v1${path}`, { method: options.method ?? 'GET', body: options.body as Record<string, unknown> | undefined, query: options.query })
  } catch (err) {
    const e = err as { response?: { status?: number }; data?: ErrorBody }
    const status = e.response?.status ?? 0
    const body = e.data?.error
    if (status === 401 && path !== '/auth/login') {
      useState<boolean | null>('auth').value = false
      await navigateTo('/login')
    }
    // For input errors the field's message is more precise than the general one.
    const message = body?.fields?.[0]?.message ?? body?.message ?? (status === 0 ? 'The server cannot be reached.' : `Error ${status}.`)
    throw new ApiFailure(status, body?.code ?? 'UNKNOWN', message)
  }
}

export const failureText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.')
