import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { deviceName, deviceWithToken, toDevice } from '../../schemas/devices.js'
import { createDevice } from '../../services/devices.js'
import { installCommand, publicBaseUrl } from '../../services/install.js'

// Der Token steht nur in dieser Antwort, gespeichert wird sein Hash.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/',
    schema: { tags: ['Geräte'], body: z.object({ name: deviceName }), response: { 201: deviceWithToken } },
    handler: async (request, reply) => {
      const { device, token } = await createDevice(request.body.name)
      reply.code(201).header('cache-control', 'no-store')
      return { device: toDevice(device), token, installCommand: installCommand(publicBaseUrl(request), token) }
    },
  })
}

export default route
