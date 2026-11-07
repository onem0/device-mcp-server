import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'

// Nur Routen mit config.rateLimit sind begrenzt (derzeit der Login).
export default fp(
  async (fastify) => {
    await fastify.register(rateLimit, { global: false })
  },
  { name: 'rate-limit' },
)
