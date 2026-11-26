import websocket from '@fastify/websocket'
import fp from 'fastify-plugin'
import { hub } from '../services/hub.js'
import { watchUpdates } from '../services/updates.js'

export default fp(
  async (fastify) => {
    // Images (base64) and write_file contents go over the wire as a single message.
    await fastify.register(websocket, { options: { maxPayload: 32 * 1024 * 1024 } })
    hub.start(fastify.log)
    watchUpdates(fastify.log)
    // Open WebSockets would otherwise hold up fastify.close().
    fastify.addHook('preClose', async () => hub.stop())
  },
  { name: 'websocket' },
)
