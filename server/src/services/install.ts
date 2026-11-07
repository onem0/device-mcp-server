import type { FastifyRequest } from 'fastify'
import { env } from '../env.js'

// Ohne PUBLIC_URL aus der Anfrage ableiten (X-Forwarded-Proto/-Host vom Proxy).
export const publicBaseUrl = (request: FastifyRequest) => env.PUBLIC_URL ?? `${request.protocol}://${request.host}`

// Der Token steht in einer Umgebungsvariable statt in der URL, damit er nicht in Proxy-Logs landet.
export const installCommand = (baseUrl: string, token: string) => `curl -fsSL ${baseUrl}/install.sh | DEVICE_MCP_TOKEN='${token}' bash`

export const uninstallCommand = (baseUrl: string) => `curl -fsSL ${baseUrl}/uninstall.sh | bash`
