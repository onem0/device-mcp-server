import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from '@fastify/type-provider-zod'
import fp from 'fastify-plugin'
import { isProduction } from '../env.js'
import { VERSION } from '../version.js'

// OpenAPI für die Panel-API unter /v1. Die Oberfläche nur lokal, damit die Struktur nicht öffentlich herumliegt.
export default fp(
  async (fastify) => {
    await fastify.register(swagger, {
      openapi: {
        info: { title: 'device-mcp Panel-API', version: VERSION },
        servers: [],
      },
      // Routen-Dateien registrieren url: '/', im Vertrag sollen die Pfade aber ohne Schrägstrich am Ende stehen.
      transform: (input) => {
        const { schema, url } = jsonSchemaTransform(input)
        return { schema, url: url.length > 1 ? url.replace(/\/$/, '') : url }
      },
    })
    if (!isProduction) await fastify.register(swaggerUi, { routePrefix: '/docs' })
  },
  { name: 'swagger' },
)
