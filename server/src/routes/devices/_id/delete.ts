import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { idParams, ok } from '../../../schemas/common.js'
import { deleteDevice } from '../../../services/devices.js'
import { hub } from '../../../services/hub.js'
import { CloseCode } from '../../../services/protocol.js'
import { forgetUpdate } from '../../../services/updates.js'

// Deletes the device along with its jobs and audit log. The daemon stays installed on the device but can no longer get in.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'DELETE',
    url: '/',
    schema: { tags: ['Devices'], params: idParams, response: { 200: ok } },
    handler: async (request) => {
      await deleteDevice(request.params.id)
      hub.disconnect(request.params.id, CloseCode.InvalidToken, 'device deleted')
      forgetUpdate(request.params.id)
      return { ok: true as const }
    },
  })
}

export default route
