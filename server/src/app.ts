import path from 'node:path'
import autoload from '@fastify/autoload'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import Fastify from 'fastify'
import { env } from './env.js'
import daemonGateway from './endpoints/daemon-gateway.js'
import downloads from './endpoints/downloads.js'
import health from './endpoints/health.js'
import mcp from './endpoints/mcp.js'
import panel from './endpoints/panel.js'

const hops = (n: number) => (_address: string, index: number) => index < n

export async function buildApp() {
  const app = Fastify({
    // Never log tokens and session cookies, not even with changed serializers.
    logger: { level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie', 'headers.authorization', 'headers.cookie'] },
    // Runs behind Traefik (Coolify), possibly Cloudflare as well: client IP and protocol from X-Forwarded-*.
    // A hop count of n means: trust the n nearest addresses in the chain (index 0 is the direct proxy).
    trustProxy: typeof env.TRUST_PROXY === 'number' ? hops(env.TRUST_PROXY) : env.TRUST_PROXY,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(autoload, {
    dir: path.join(import.meta.dirname, 'plugins'),
    ignorePattern: /\.(test|spec)\.ts$/,
  })

  // Panel API
  await app.register(autoload, {
    dir: path.join(import.meta.dirname, 'routes'),
    routeParams: true,
    autoHooks: true,
    cascadeHooks: true,
    ignorePattern: /\.(test|spec)\.ts$/,
    options: { prefix: '/v1' },
  })

  // Fixed paths outside /v1: MCP, daemon WebSocket, installer, health check, panel files.
  await app.register(mcp)
  await app.register(daemonGateway)
  await app.register(downloads)
  await app.register(health)
  await app.register(panel)

  return app
}
