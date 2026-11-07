import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { device, toDevice } from '../../schemas/devices.js'
import { listDevices } from '../../services/devices.js'

const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/',
    schema: { tags: ['Devices'], response: { 200: z.array(device) } },
    handler: async () => (await listDevices()).map(toDevice),
  })
}

export default route
