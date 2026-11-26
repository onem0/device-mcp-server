import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { idParams } from '../../../../schemas/common.js'
import { device, toDevice } from '../../../../schemas/devices.js'
import { latestDaemonVersion } from '../../../../services/daemon-release.js'
import { getDevice } from '../../../../services/devices.js'
import { ApiError } from '../../../../services/errors.js'
import { daemonUpdateState } from '../../../../services/guards.js'
import { hub } from '../../../../services/hub.js'
import { startUpdate } from '../../../../services/updates.js'

// „Update“ im Panel: Der Daemon lädt die Version, die dieser Server ausliefert, und startet neu, sobald kein Job läuft.
// Die Antwort kommt sofort (202). Den Fortschritt zeigt updateStatus in der Geräteliste.
const route: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/',
    schema: { tags: ['Devices'], params: idParams, response: { 202: device } },
    handler: async (request, reply) => {
      const found = await getDevice(request.params.id)
      const conn = hub.connection(found.id)
      if (!conn) throw new ApiError(409, 'DEVICE_OFFLINE', 'The device is not connected. It can only be updated while it is online.')
      const latest = latestDaemonVersion()
      const state = daemonUpdateState(conn.info.version, latest)
      if (state === null) throw new ApiError(409, 'UP_TO_DATE', `The daemon is already up to date (${conn.info.version}).`)
      if (state === 'manual') {
        throw new ApiError(409, 'MANUAL_UPDATE', `Daemon ${conn.info.version} cannot be updated from the panel yet. Run the install script on the device once.`)
      }
      startUpdate(found, { force: true })
      return reply.code(202).send(toDevice(found))
    },
  })
}

export default route
