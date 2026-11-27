import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { idParams, ok } from '../../../schemas/common.js'
import { deleteMemory } from '../../../services/memory.js'

const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'DELETE',
    url: '/',
    schema: { tags: ['Memory'], params: idParams, response: { 200: ok } },
    handler: async (request) => {
      await deleteMemory(request.params.id)
      return { ok: true as const }
    },
  })
}

export default route
