import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { idParams } from '../../../../schemas/common.js'
import { deviceWithToken, toDevice } from '../../../../schemas/devices.js'
import { regenerateToken } from '../../../../services/devices.js'
import { hub } from '../../../../services/hub.js'
import { installCommand, publicBaseUrl } from '../../../../services/install.js'
import { CloseCode } from '../../../../services/protocol.js'

// New token: the old one stops working immediately, the current connection is closed.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/',
    schema: { tags: ['Devices'], params: idParams, response: { 200: deviceWithToken } },
    handler: async (request, reply) => {
      const { device, token } = await regenerateToken(request.params.id)
      hub.disconnect(device.id, CloseCode.InvalidToken, 'token regenerated')
      reply.header('cache-control', 'no-store')
      return { device: toDevice(device), token, installCommand: installCommand(publicBaseUrl(request), token) }
    },
  })
}

export default route
