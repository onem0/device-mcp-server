import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from '@fastify/type-provider-zod'
import fp from 'fastify-plugin'
import { isProduction } from '../env.js'
import { VERSION } from '../version.js'

// OpenAPI for the panel API under /v1. The UI only locally, so the structure is not lying around in public.
export default fp(
  async (fastify) => {
    await fastify.register(swagger, {
      openapi: {
        info: { title: 'device-mcp panel API', version: VERSION },
        servers: [],
      },
      // Route files register url: '/', but in the contract the paths should have no trailing slash.
      transform: (input) => {
        const { schema, url } = jsonSchemaTransform(input)
        return { schema, url: url.length > 1 ? url.replace(/\/$/, '') : url }
      },
    })
    if (!isProduction) await fastify.register(swaggerUi, { routePrefix: '/docs' })
  },
  { name: 'swagger' },
)
