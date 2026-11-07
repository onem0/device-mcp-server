import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export const newToken = (prefix = '') => prefix + randomBytes(32).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// Vergleicht in konstanter Zeit. Beide Seiten werden gehasht, damit auch die Länge nichts verrät.
export function safeEqual(given: string, expected: string) {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// Kurze Job-IDs, die Claude leicht abtippen kann. Ohne 0/o/1/l.
const JOB_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
export const newJobId = () => Array.from({ length: 10 }, () => JOB_ALPHABET[randomInt(JOB_ALPHABET.length)]).join('')
