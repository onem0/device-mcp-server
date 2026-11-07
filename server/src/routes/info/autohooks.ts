import type { FastifyInstance } from 'fastify'
import { requireSession } from '../../plugins/auth.js'

export default async function (fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireSession)
}
