import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { memory, memoryInput, toMemory } from '../../schemas/memories.js'
import { getDevice } from '../../services/devices.js'
import { createMemory } from '../../services/memory.js'

// A note written in the panel. Unlike memory_save there is no merge by title: the panel creates exactly what it sends.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/',
    schema: { tags: ['Memory'], body: memoryInput, response: { 201: memory } },
    handler: async (request, reply) => {
      if (request.body.deviceId) await getDevice(request.body.deviceId)
      const created = await createMemory({ ...request.body, deviceId: request.body.deviceId ?? null }, 'panel')
      return reply.code(201).send(toMemory(created))
    },
  })
}

export default route
