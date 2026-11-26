import type { FastifyRequest } from 'fastify'
import { env } from '../env.js'

// Without PUBLIC_URL, derive it from the request (X-Forwarded-Proto/-Host from the proxy).
export const publicBaseUrl = (request: FastifyRequest) => env.PUBLIC_URL ?? `${request.protocol}://${request.host}`

// The token goes in an environment variable instead of the URL so it does not end up in proxy logs.
export const installCommand = (baseUrl: string, token: string) => `curl -fsSL ${baseUrl}/install.sh | DEVICE_MCP_TOKEN='${token}' bash`

// Without a token: updates the binary and the service, token and config stay.
export const updateCommand = (baseUrl: string) => `curl -fsSL ${baseUrl}/install.sh | bash`

export const uninstallCommand = (baseUrl: string) => `curl -fsSL ${baseUrl}/uninstall.sh | bash`
