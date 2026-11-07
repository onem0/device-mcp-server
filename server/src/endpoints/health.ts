import type { FastifyInstance } from 'fastify'
import { pool } from '../db/client.js'

export default async function health(fastify: FastifyInstance) {
  fastify.get('/healthz', { schema: { hide: true } }, async () => {
    await pool.query('select 1')
    return { ok: true }
  })
}
