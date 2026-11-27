import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { idParams } from '../../../schemas/common.js'
import { memory, memoryInput, toMemory } from '../../../schemas/memories.js'
import { getDevice } from '../../../services/devices.js'
import { updateMemory } from '../../../services/memory.js'

// Change a note: text, path, tags, pinning, or the scope (deviceId null = global).
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'PATCH',
    url: '/',
    schema: {
      tags: ['Memory'],
      params: idParams,
      body: memoryInput.partial().refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.'),
      response: { 200: memory },
    },
    handler: async (request) => {
      if (request.body.deviceId) await getDevice(request.body.deviceId)
      return toMemory(await updateMemory(request.params.id, request.body, 'panel'))
    },
  })
}

export default route
