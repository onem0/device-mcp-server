import fp from 'fastify-plugin'
import { db, pool, type Db } from '../db/client.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
  }
}

export default fp(
  async (fastify) => {
    fastify.decorate('db', db)
    fastify.addHook('onClose', async () => {
      await pool.end()
    })
  },
  { name: 'db' },
)
