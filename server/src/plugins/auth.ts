import cookie from '@fastify/cookie'
import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '../env.js'
import { ApiError } from '../services/errors.js'
import { resolveSession } from '../services/sessions.js'

export const SESSION_COOKIE = 'dmcp_session'

export const setSessionCookie = (reply: FastifyReply, token: string) =>
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: env.SESSION_TTL_HOURS * 3600,
  })

export const clearSessionCookie = (reply: FastifyReply) =>
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: true, sameSite: 'strict' })

export const sessionToken = (request: FastifyRequest) => request.cookies[SESSION_COOKIE]

// Für autohooks.ts der geschützten Panel-Routen.
export async function requireSession(request: FastifyRequest) {
  const token = sessionToken(request)
  const session = token ? await resolveSession(token) : null
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in.')
}

export default fp(
  async (fastify) => {
    await fastify.register(cookie)
  },
  { name: 'auth' },
)
