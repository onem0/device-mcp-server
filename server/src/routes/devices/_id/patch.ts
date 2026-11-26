import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { idParams } from '../../../schemas/common.js'
import { device, deviceName, toDevice } from '../../../schemas/devices.js'
import { updateDevice } from '../../../services/devices.js'
import { hub } from '../../../services/hub.js'
import { CloseCode } from '../../../services/protocol.js'
import { autoUpdateIfDue } from '../../../services/updates.js'

// Rename, enable/disable, "read-only" and auto-update. Disabling closes the connection immediately.
// Turning auto-update on catches up on a pending update right away.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'PATCH',
    url: '/',
    schema: {
      tags: ['Devices'],
      params: idParams,
      body: z
        .object({ name: deviceName.optional(), enabled: z.boolean().optional(), readOnly: z.boolean().optional(), autoUpdate: z.boolean().optional() })
        .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.'),
      response: { 200: device },
    },
    handler: async (request) => {
      const updated = await updateDevice(request.params.id, request.body)
      if (request.body.enabled === false) hub.disconnect(updated.id, CloseCode.Disabled, 'device disabled')
      if (request.body.autoUpdate === true) autoUpdateIfDue(updated, updated.daemonVersion)
      return toDevice(updated)
    },
  })
}

export default route
