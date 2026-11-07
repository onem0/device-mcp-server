import { existsSync } from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fp from 'fastify-plugin'
import { env } from '../env.js'

const API_PREFIXES = ['/v1/', '/mcp', '/daemon/', '/download/']

// Liefert das gebaute Nuxt-Panel (nuxt generate, ssr: false) und fällt für Client-Routen auf die SPA zurück.
export default fp(async (fastify) => {
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    return payload
  })

  const root = env.PANEL_DIST_DIR
  const hasPanel = existsSync(path.join(root, 'index.html'))
  if (!hasPanel) fastify.log.warn({ root }, 'Kein gebautes Panel gefunden, nur API und MCP sind erreichbar')

  if (hasPanel) {
    await fastify.register(fastifyStatic, {
      root,
      prefix: '/',
      setHeaders: (res, filePath) => {
        res.header('cache-control', filePath.includes(`${path.sep}_nuxt${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
  }

  const spaShell = existsSync(path.join(root, '200.html')) ? '200.html' : 'index.html'

  fastify.setNotFoundHandler((request, reply) => {
    const isApi = API_PREFIXES.some((p) => request.url.startsWith(p))
    if (hasPanel && !isApi && (request.method === 'GET' || request.method === 'HEAD')) {
      return reply.header('cache-control', 'no-cache').sendFile(spaShell)
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } })
  })
})
