import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { clearSessionCookie, sessionToken } from '../../../plugins/auth.js'
import { ok } from '../../../schemas/common.js'
import { deleteSession } from '../../../services/sessions.js'

const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/',
    schema: { tags: ['Auth'], response: { 200: ok } },
    handler: async (request, reply) => {
      const token = sessionToken(request)
      if (token) await deleteSession(token)
      clearSessionCookie(reply)
      return { ok: true as const }
    },
  })
}

export default route
