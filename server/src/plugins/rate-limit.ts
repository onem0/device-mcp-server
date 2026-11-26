import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'

// Only routes with config.rateLimit are limited (currently the login).
export default fp(
  async (fastify) => {
    await fastify.register(rateLimit, { global: false })
  },
  { name: 'rate-limit' },
)
