import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { idParams } from '../../../schemas/common.js'
import { device, deviceName, toDevice } from '../../../schemas/devices.js'
import { updateDevice } from '../../../services/devices.js'
import { hub } from '../../../services/hub.js'
import { CloseCode } from '../../../services/protocol.js'

// Umbenennen, Aktivieren/Deaktivieren und „nur lesen“. Deaktivieren trennt die Verbindung sofort.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'PATCH',
    url: '/',
    schema: {
      tags: ['Devices'],
      params: idParams,
      body: z
        .object({ name: deviceName.optional(), enabled: z.boolean().optional(), readOnly: z.boolean().optional() })
        .refine((v) => v.name !== undefined || v.enabled !== undefined || v.readOnly !== undefined, 'Nothing to change.'),
      response: { 200: device },
    },
    handler: async (request) => {
      const updated = await updateDevice(request.params.id, request.body)
      if (request.body.enabled === false) hub.disconnect(updated.id, CloseCode.Disabled, 'device disabled')
      return toDevice(updated)
    },
  })
}

export default route
