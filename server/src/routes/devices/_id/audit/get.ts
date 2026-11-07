import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { idParams } from '../../../../schemas/common.js'
import { auditEntry, toAuditEntry } from '../../../../schemas/devices.js'
import { listAudit } from '../../../../services/audit.js'
import { getDevice } from '../../../../services/devices.js'

const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      tags: ['Devices'],
      params: idParams,
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      response: { 200: z.object({ entries: z.array(auditEntry), total: z.number().int() }) },
    },
    handler: async (request) => {
      await getDevice(request.params.id)
      const { entries, total } = await listAudit({ deviceId: request.params.id }, request.query.limit, request.query.offset)
      return { entries: entries.map(toAuditEntry), total }
    },
  })
}

export default route
