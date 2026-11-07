import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { env } from '../env.js'
import { publicBaseUrl } from '../services/install.js'

const INSTALL_DIR = path.join(import.meta.dirname, '..', '..', 'install')

const script = (name: string) => readFile(path.join(INSTALL_DIR, name), 'utf8')

// Installer, Uninstaller und Daemon-Binaries sind öffentlich: Sie enthalten keine Geheimnisse,
// der Geräte-Token kommt erst beim Aufruf über DEVICE_MCP_TOKEN dazu.
const downloads: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get('/install.sh', { schema: { hide: true } }, async (request, reply) => {
    const body = (await script('install.sh')).replaceAll('__SERVER_URL__', publicBaseUrl(request))
    return reply.type('text/x-shellscript; charset=utf-8').header('cache-control', 'no-store').send(body)
  })

  fastify.get('/uninstall.sh', { schema: { hide: true } }, async (_request, reply) => {
    return reply.type('text/x-shellscript; charset=utf-8').header('cache-control', 'no-store').send(await script('uninstall.sh'))
  })

  fastify.get(
    '/download/:file',
    { schema: { hide: true, params: z.object({ file: z.string().regex(/^device-mcp-linux-(x64|arm64)(\.gz)?$/) }) } },
    async (request, reply) => {
      const file = path.join(env.DAEMON_DIST_DIR, request.params.file)
      const info = await stat(file).catch(() => null)
      if (!info?.isFile()) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'This binary was not built.' } })
      return reply
        .type(file.endsWith('.gz') ? 'application/gzip' : 'application/octet-stream')
        .header('content-length', info.size)
        .header('content-disposition', `attachment; filename="${request.params.file}"`)
        .header('cache-control', 'no-cache')
        .send(createReadStream(file))
    },
  )
}

export default downloads
