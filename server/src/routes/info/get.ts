import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { env } from '../../env.js'
import { publicBaseUrl, uninstallCommand } from '../../services/install.js'
import { VERSION } from '../../version.js'

// Verbindungsdaten für die Anleitung im Panel. Der MCP-Token selbst wird nie ausgeliefert.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      tags: ['Server'],
      response: {
        200: z.object({
          version: z.string(),
          baseUrl: z.string(),
          mcpUrl: z.string(),
          uninstallCommand: z.string(),
          heartbeatTimeoutSeconds: z.number().int(),
        }),
      },
    },
    handler: async (request) => {
      const baseUrl = publicBaseUrl(request)
      return {
        version: VERSION,
        baseUrl,
        mcpUrl: `${baseUrl}/mcp`,
        uninstallCommand: uninstallCommand(baseUrl),
        heartbeatTimeoutSeconds: env.HEARTBEAT_TIMEOUT_SECONDS,
      }
    },
  })
}

export default route
