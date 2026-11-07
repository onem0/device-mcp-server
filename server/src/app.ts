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
    // Tokens und Sitzungs-Cookies nie ins Log, auch nicht bei geänderten Serializern.
    logger: { level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie', 'headers.authorization', 'headers.cookie'] },
    // Läuft hinter Traefik (Coolify), evtl. zusätzlich Cloudflare: Client-IP und Protokoll aus X-Forwarded-*.
    // Eine Hop-Zahl n heißt: den n nächsten Adressen in der Kette vertrauen (Index 0 ist der direkte Proxy).
    trustProxy: typeof env.TRUST_PROXY === 'number' ? hops(env.TRUST_PROXY) : env.TRUST_PROXY,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(autoload, {
    dir: path.join(import.meta.dirname, 'plugins'),
    ignorePattern: /\.(test|spec)\.ts$/,
  })

  // Panel-API
  await app.register(autoload, {
    dir: path.join(import.meta.dirname, 'routes'),
    routeParams: true,
    autoHooks: true,
    cascadeHooks: true,
    ignorePattern: /\.(test|spec)\.ts$/,
    options: { prefix: '/v1' },
  })

  // Feste Pfade außerhalb von /v1: MCP, Daemon-WebSocket, Installer, Healthcheck, Panel-Dateien.
  await app.register(mcp)
  await app.register(daemonGateway)
  await app.register(downloads)
  await app.register(health)
  await app.register(panel)

  return app
}
