import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { env } from '../../../env.js'
import { setSessionCookie } from '../../../plugins/auth.js'
import { ok } from '../../../schemas/common.js'
import { ApiError } from '../../../services/errors.js'
import { createSession } from '../../../services/sessions.js'
import { safeEqual } from '../../../services/tokens.js'

// Unabhängig von der IP: höchstens 30 Fehlversuche in 15 Minuten, danach kurz Ruhe.
// Schützt das eine Passwort auch dann, wenn jemand die Client-IP fälschen kann.
const FAIL_WINDOW_MS = 15 * 60_000
const FAIL_MAX = 30
let failures: number[] = []

const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/',
    // Pro IP höchstens 10 Versuche in 15 Minuten, erfolgreiche mitgezählt.
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Anmeldung'],
      body: z.object({ password: z.string().min(1).max(1000) }),
      response: { 200: ok },
    },
    handler: async (request, reply) => {
      const now = Date.now()
      failures = failures.filter((t) => now - t < FAIL_WINDOW_MS)
      if (failures.length >= FAIL_MAX) {
        throw new ApiError(429, 'RATE_LIMITED', 'Zu viele Fehlversuche. Warte ein paar Minuten.')
      }
      if (!safeEqual(request.body.password, env.PANEL_PASSWORD)) {
        failures.push(now)
        request.log.warn({ ip: request.ip }, 'Falsches Panel-Passwort')
        throw new ApiError(401, 'INVALID_PASSWORD', 'Das Passwort stimmt nicht.')
      }
      const token = await createSession({ userAgent: request.headers['user-agent'], ip: request.ip })
      setSessionCookie(reply, token)
      return { ok: true as const }
    },
  })
}

export default route
