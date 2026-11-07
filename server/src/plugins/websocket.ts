import websocket from '@fastify/websocket'
import fp from 'fastify-plugin'
import { hub } from '../services/hub.js'

export default fp(
  async (fastify) => {
    // Bilder (base64) und write_file-Inhalte gehen als einzelne Nachricht über die Leitung.
    await fastify.register(websocket, { options: { maxPayload: 32 * 1024 * 1024 } })
    hub.start(fastify.log)
    // Offene WebSockets halten fastify.close() sonst auf.
    fastify.addHook('preClose', async () => hub.stop())
  },
  { name: 'websocket' },
)
