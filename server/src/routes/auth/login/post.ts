import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { env } from '../../../env.js'
import { setSessionCookie } from '../../../plugins/auth.js'
import { ok } from '../../../schemas/common.js'
import { ApiError } from '../../../services/errors.js'
import { createSession } from '../../../services/sessions.js'
import { safeEqual } from '../../../services/tokens.js'

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
      if (!safeEqual(request.body.password, env.PANEL_PASSWORD)) {
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
