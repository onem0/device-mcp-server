import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { idParams } from '../../../schemas/common.js'
import { device, toDevice } from '../../../schemas/devices.js'
import { getDevice } from '../../../services/devices.js'

const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/',
    schema: { tags: ['Geräte'], params: idParams, response: { 200: device } },
    handler: async (request) => toDevice(await getDevice(request.params.id)),
  })
}

export default route
