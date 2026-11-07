import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod/v4'
import { env } from '../../../env.js'
import { setSessionCookie } from '../../../plugins/auth.js'
import { ok } from '../../../schemas/common.js'
import { ApiError } from '../../../services/errors.js'
import { createSession } from '../../../services/sessions.js'
import { safeEqual } from '../../../services/tokens.js'

// Unabhängig von der IP: Ab 30 Fehlversuchen in 15 Minuten laufen Passwortprüfungen nur noch nacheinander,
// höchstens eine pro Sekunde. Das deckelt verteiltes Raten insgesamt, auch mit gefälschten IPs oder vielen
// parallelen Anfragen. Das richtige Passwort kommt durch, sobald es an der Reihe ist; nur wenn die Schlange
// voll ist, gibt es vorübergehend 429. MCP und Daemons sind davon nicht betroffen.
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
  if (waiting >= MAX_WAITING) throw new ApiError(429, 'RATE_LIMITED', 'Gerade laufen zu viele Anmeldeversuche. Versuch es in ein paar Minuten erneut.')
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
    // Pro IP höchstens 10 Versuche in 15 Minuten, erfolgreiche mitgezählt.
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Anmeldung'],
      body: z.object({ password: z.string().min(1).max(1000) }),
      response: { 200: ok },
    },
    handler: async (request, reply) => {
      if (underAttack()) await waitForTurn()
      if (!safeEqual(request.body.password, env.PANEL_PASSWORD)) {
        failures.push(Date.now())
        request.log.warn({ ip: request.ip }, 'Falsches Panel-Passwort')
        throw new ApiError(401, 'INVALID_PASSWORD', 'Das Passwort stimmt nicht.')
      }
      const token = await createSession({ userAgent: request.headers['user-agent'], ip: request.ip })
      setSessionCookie(reply, token)
      return { ok: true as const }
    },
  })
}

export default route
