import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { idParams, ok } from '../../../schemas/common.js'
import { deleteDevice } from '../../../services/devices.js'
import { hub } from '../../../services/hub.js'
import { CloseCode } from '../../../services/protocol.js'

// Löscht das Gerät samt Jobs und Audit-Log. Der Daemon auf dem Gerät bleibt installiert, kommt aber nicht mehr rein.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'DELETE',
    url: '/',
    schema: { tags: ['Geräte'], params: idParams, response: { 200: ok } },
    handler: async (request) => {
      await deleteDevice(request.params.id)
      hub.disconnect(request.params.id, CloseCode.InvalidToken, 'device deleted')
      return { ok: true as const }
    },
  })
}

export default route
