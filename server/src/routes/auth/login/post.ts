import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { env } from '../../../env.js'
import { setSessionCookie } from '../../../plugins/auth.js'
import { ok } from '../../../schemas/common.js'
import { ApiError } from '../../../services/errors.js'
import { createSession } from '../../../services/sessions.js'
import { safeEqual } from '../../../services/tokens.js'

// Independent of the IP: from 30 failed attempts in 15 minutes on, password checks only run one after another,
// at most one per second. That caps distributed guessing overall, even with spoofed IPs or many
// parallel requests. The correct password gets through as soon as its turn comes; only when the queue
// is full is there a temporary 429. MCP and daemons are not affected by this.
const FAIL_WINDOW_MS = 15 * 60_000
const SERIALIZE_AFTER = 30
const SPACING_MS = 1_000
const MAX_WAITING = 20
let failures: number[] = []
let gate: Promise<void> = Promise.resolve()
let waiting = 0

function underAttack() {
  const now = Date.now()
  failures = failures.filter((t) => now - t < FAIL_WINDOW_MS).slice(-1000)
  return failures.length >= SERIALIZE_AFTER
}

async function waitForTurn() {
  if (waiting >= MAX_WAITING) throw new ApiError(429, 'RATE_LIMITED', 'Too many login attempts right now. Try again in a few minutes.')
  waiting++
  const turn = gate.then(() => new Promise<void>((resolve) => setTimeout(resolve, SPACING_MS)))
  gate = turn
  try {
    await turn
  } finally {
    waiting--
  }
}

const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/',
    // At most 10 attempts per IP in 15 minutes, successful ones included.
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Auth'],
      body: z.object({ password: z.string().min(1).max(1000) }),
      response: { 200: ok },
    },
    handler: async (request, reply) => {
      if (underAttack()) await waitForTurn()
      if (!safeEqual(request.body.password, env.PANEL_PASSWORD)) {
        failures.push(Date.now())
        request.log.warn({ ip: request.ip }, 'Wrong panel password')
        throw new ApiError(401, 'INVALID_PASSWORD', 'Wrong password.')
      }
      const token = await createSession({ userAgent: request.headers['user-agent'], ip: request.ip })
      setSessionCookie(reply, token)
      return { ok: true as const }
    },
  })
}

export default route
