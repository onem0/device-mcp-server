import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { env } from '../../env.js'
import { latestDaemonVersion } from '../../services/daemon-release.js'
import { publicBaseUrl, uninstallCommand, updateCommand } from '../../services/install.js'
import { VERSION } from '../../version.js'

// Connection details for the instructions in the panel. The MCP token itself is never sent out.
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
          updateCommand: z.string(),
          uninstallCommand: z.string(),
          // Version of the daemon binaries this server ships. null if none were built.
          daemonVersion: z.string().nullable(),
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
        updateCommand: updateCommand(baseUrl),
        uninstallCommand: uninstallCommand(baseUrl),
        daemonVersion: latestDaemonVersion(),
        heartbeatTimeoutSeconds: env.HEARTBEAT_TIMEOUT_SECONDS,
      }
    },
  })
}

export default route
