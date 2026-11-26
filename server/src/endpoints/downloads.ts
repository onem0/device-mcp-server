import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { binaryUrl, daemonManifest, refreshDaemonRelease, releaseUrl } from '../services/daemon-release.js'
import { publicBaseUrl } from '../services/install.js'

const INSTALL_DIR = path.join(import.meta.dirname, '..', '..', 'install')

const script = (name: string) => readFile(path.join(INSTALL_DIR, name), 'utf8')

// Installer and uninstaller are public: they contain no secrets,
// the device token is only added at invocation via DEVICE_MCP_TOKEN.
const downloads: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get('/install.sh', { schema: { hide: true } }, async (request, reply) => {
    const body = (await script('install.sh')).replaceAll('__SERVER_URL__', publicBaseUrl(request)).replaceAll('__RELEASE_URL__', releaseUrl())
    return reply.type('text/x-shellscript; charset=utf-8').header('cache-control', 'no-store').send(body)
  })

  fastify.get('/uninstall.sh', { schema: { hide: true } }, async (_request, reply) => {
    return reply.type('text/x-shellscript; charset=utf-8').header('cache-control', 'no-store').send(await script('uninstall.sh'))
  })

  // Compatibility for daemons before 0.5.0, which still fetch updates from their server: the server passes
  // the latest GitHub release through. Newer daemons and the install script download from GitHub directly.
  fastify.get('/download/manifest.json', { schema: { hide: true } }, async (_request, reply) => {
    await refreshDaemonRelease()
    const manifest = daemonManifest()
    if (!manifest) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No daemon release is known.' } })
    return reply.header('cache-control', 'no-store').send(manifest)
  })

  fastify.get(
    '/download/:file',
    { schema: { hide: true, params: z.object({ file: z.string().regex(/^device-mcp-(linux|darwin)-(x64|arm64)\.gz$/) }) } },
    async (request, reply) => {
      const manifest = daemonManifest()
      if (!manifest) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No daemon release is known.' } })
      const upstream = await fetch(binaryUrl(manifest.version, request.params.file)).catch(() => null)
      if (!upstream?.ok || !upstream.body) {
        return reply.code(502).send({ error: { code: 'UPSTREAM', message: 'Could not fetch the daemon release from GitHub.' } })
      }
      const length = upstream.headers.get('content-length')
      if (length) reply.header('content-length', length)
      return reply
        .type('application/gzip')
        .header('content-disposition', `attachment; filename="${request.params.file}"`)
        .header('cache-control', 'no-store')
        .send(Readable.fromWeb(upstream.body as never))
    },
  )
}

export default downloads
