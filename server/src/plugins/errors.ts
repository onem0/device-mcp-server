import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod'
import fp from 'fastify-plugin'
import { ApiError } from '../services/errors.js'

export default fp(
  async (fastify) => {
    fastify.setErrorHandler((err: any, request, reply) => {
      if (hasZodFastifySchemaValidationErrors(err)) {
        const fields = err.validation.map((v: any) => ({
          field: String(v.instancePath ?? '').replace(/^\//, ''),
          message: v.message,
        }))
        return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Bitte prüfe die Eingaben.', fields } })
      }
      if (err instanceof ApiError) {
        return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } })
      }
      if (err.statusCode === 429) {
        return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Zu viele Versuche. Warte ein paar Minuten.' } })
      }
      if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
        return reply.code(err.statusCode).send({ error: { code: err.code ?? 'BAD_REQUEST', message: err.message } })
      }
      request.log.error(err)
      return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Etwas ist schiefgelaufen. Versuch es erneut.' } })
    })
  },
  { name: 'errors' },
)
