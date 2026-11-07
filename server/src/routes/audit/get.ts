import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { auditEntry, toAuditEntry } from '../../schemas/devices.js'
import { listAudit } from '../../services/audit.js'

// Protokoll über alle Geräte, neueste zuerst. Mit device nur die Einträge dieses Geräts.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      tags: ['Protokoll'],
      querystring: z.object({
        device: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      response: { 200: z.object({ entries: z.array(auditEntry), total: z.number().int() }) },
    },
    handler: async (request) => {
      const { entries, total } = await listAudit({ deviceId: request.query.device }, request.query.limit, request.query.offset)
      return { entries: entries.map(toAuditEntry), total }
    },
  })
}

export default route
