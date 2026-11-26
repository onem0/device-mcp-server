import type { FastifyInstance } from 'fastify'
import { hub } from '../services/hub.js'

// The daemons connect on their own. The token comes in the first message (hello), not in the URL.
export default async function daemonGateway(fastify: FastifyInstance) {
  fastify.get('/daemon/ws', { websocket: true, schema: { hide: true } }, (socket, request) => {
    hub.attach(socket, request.ip)
  })
}
