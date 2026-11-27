import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { env } from '../env.js'
import { createMcpServer } from '../services/mcp.js'
import { safeEqual } from '../services/tokens.js'

// write_file takes up to 10 MB of text, plus base64 and the JSON envelope.
const BODY_LIMIT = 20 * 1024 * 1024

function hasValidBearer(request: FastifyRequest) {
  const header = request.headers.authorization
  if (typeof header !== 'string') return false
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header)
  return match ? safeEqual(match[1]!, env.MCP_TOKEN) : false
}

// Streamable HTTP without sessions: every POST request gets a fresh MCP server.
// That survives restarts and needs no state between requests.
// Responses come as an SSE stream: the SDK then sends a keepalive comment every 15 s,
// otherwise proxies like Cloudflare (100 s without data) cut off long run_command calls.
export default async function mcp(fastify: FastifyInstance) {
  fastify.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    bodyLimit: BODY_LIMIT,
    schema: { hide: true },
    onRequest: async (request, reply) => {
      // Deliberately without a body and without WWW-Authenticate: no hints for anyone guessing.
      if (!hasValidBearer(request)) return reply.code(401).send()
    },
    handler: async (request, reply) => {
      if (request.method !== 'POST') return reply.code(405).header('allow', 'POST').send()

      const server = await createMcpServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      reply.hijack()
      reply.raw.on('close', () => {
        void transport.close()
        void server.close()
      })
      try {
        await server.connect(transport)
        await transport.handleRequest(request.raw, reply.raw, request.body)
      } catch (err) {
        request.log.error({ err }, 'MCP request failed')
        if (!reply.raw.headersSent) {
          reply.raw
            .writeHead(500, { 'content-type': 'application/json' })
            .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }))
        }
      }
    },
  })
}
