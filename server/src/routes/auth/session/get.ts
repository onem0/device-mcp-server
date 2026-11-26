import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { sessionToken } from '../../../plugins/auth.js'
import { resolveSession } from '../../../services/sessions.js'

// For the panel: is the session still valid? Always answers 200 so the login check stays simple.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/',
    schema: { tags: ['Auth'], response: { 200: z.object({ authenticated: z.boolean() }) } },
    handler: async (request) => {
      const token = sessionToken(request)
      return { authenticated: token ? (await resolveSession(token)) !== null : false }
    },
  })
}

export default route
