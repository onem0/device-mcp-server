import type { FastifyInstance } from 'fastify'
import { hub } from '../services/hub.js'

// Die Daemons verbinden sich von sich aus. Der Token kommt in der ersten Nachricht (hello), nicht in der URL.
export default async function daemonGateway(fastify: FastifyInstance) {
  fastify.get('/daemon/ws', { websocket: true, schema: { hide: true } }, (socket, request) => {
    hub.attach(socket, request.ip)
  })
}
