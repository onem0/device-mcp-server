import type { FastifyBaseLogger } from 'fastify'
import { latestDaemonVersion } from './daemon-release.js'
import type { Device } from './devices.js'
import { daemonUpdateState } from './guards.js'
import { hub } from './hub.js'
import type { UpdateResult } from './protocol.js'

// State of a daemon update that this server triggered. In memory only: after a restart of the
// server the devices reconnect, and their reported version tells what became of the update.
// running: the daemon downloads and verifies. restarting: the new binary is on the device, the restart is pending.
export interface UpdateStatus {
  state: 'running' | 'restarting' | 'failed'
  target: string | null
  message: string | null
}

// The download can take a while on a slow connection; the daemon itself gives up after 10 minutes.
const UPDATE_TIMEOUT_MS = 11 * 60_000

const statuses = new Map<string, UpdateStatus>()
let log: FastifyBaseLogger | null = null

export const updateStatus = (deviceId: string) => statuses.get(deviceId) ?? null

function restartMessage(result: Extract<UpdateResult, { status: 'installed' }>) {
  if (result.restart === 'when_idle') {
    return `Installed. The daemon restarts as soon as ${result.runningJobs === 1 ? 'the running job has' : `${result.runningJobs} running jobs have`} finished.`
  }
  if (result.restart === 'manual') return 'Installed. The daemon does not run as a service, restart it on the device.'
  return 'Installed. The daemon is restarting.'
}

// Triggers the update and returns immediately. The panel follows the state via the device list.
// force: click in the panel. Without force (auto-update) the daemon waits an hour after a failure.
export function startUpdate(device: Pick<Device, 'id' | 'name'>, opts: { force: boolean }) {
  const previous = statuses.get(device.id)
  if (previous?.state === 'running') return
  const target = latestDaemonVersion()
  statuses.set(device.id, { state: 'running', target, message: null })
  hub.request<UpdateResult>(device.id, 'update', { force: opts.force }, UPDATE_TIMEOUT_MS).then(
    (result) => {
      if (result.status === 'current') {
        statuses.delete(device.id)
        return
      }
      statuses.set(device.id, { state: 'restarting', target: result.version, message: restartMessage(result) })
      log?.info({ device: device.name, version: result.version, restart: result.restart }, 'Daemon update installed')
    },
    (err: Error & { code?: string }) => {
      // Auto-update in the wait period after a failure: no new error, the last one stays.
      // BUSY: an update from an earlier connection is already running on the device.
      if (err.code === 'UPDATE_BACKOFF' || err.code === 'BUSY') {
        if (previous?.state === 'failed') statuses.set(device.id, previous)
        else statuses.delete(device.id)
        return
      }
      statuses.set(device.id, { state: 'failed', target, message: err.message })
      log?.warn({ device: device.name, err: err.message }, 'Daemon update failed')
    },
  )
}

// Catch up on the auto-update right away when it is turned on for a connected, outdated device.
export function autoUpdateIfDue(device: Device, version: string | null | undefined) {
  if (!device.autoUpdate || !hub.isOnline(device.id)) return
  if (daemonUpdateState(version, latestDaemonVersion()) === 'available') startUpdate(device, { force: false })
}

export function watchUpdates(logger: FastifyBaseLogger) {
  log = logger
  // After every connection: clean up the state and, if turned on, trigger the auto-update.
  // A new server usually brings a new daemon along, and after a deploy all devices reconnect.
  hub.onConnect = (device, info) => {
    const state = daemonUpdateState(info.version, latestDaemonVersion())
    if (state === null) statuses.delete(device.id)
    // The daemon kept running (e.g. only the connection was gone): a started update is not lost there,
    // but the server no longer knows anything about it.
    else if (statuses.get(device.id)?.state === 'running') statuses.delete(device.id)
    autoUpdateIfDue(device, info.version)
  }
}

// Device deleted.
export const forgetUpdate = (deviceId: string) => statuses.delete(deviceId)
