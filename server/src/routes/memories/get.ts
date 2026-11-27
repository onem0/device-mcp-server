import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { memory, toMemory } from '../../schemas/memories.js'
import { listMemories } from '../../services/memory.js'

// All notes, pinned first, then by last change. device=<id> only that device's, device=global only the global ones.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      tags: ['Memory'],
      querystring: z.object({ device: z.union([z.uuid(), z.literal('global')]).optional() }),
      response: { 200: z.array(memory) },
    },
    handler: async (request) => {
      const { device } = request.query
      const list = await listMemories({ deviceId: device === undefined ? undefined : device === 'global' ? null : device })
      return list.map(toMemory)
    },
  })
}

export default route
