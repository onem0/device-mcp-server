import type { FastifyBaseLogger } from 'fastify'
import { latestDaemonVersion } from './daemon-release.js'
import type { Device } from './devices.js'
import { daemonUpdateState } from './guards.js'
import { hub } from './hub.js'
import type { UpdateResult } from './protocol.js'

// Stand eines Daemon-Updates, das dieser Server angestoßen hat. Nur im Speicher: Nach einem Neustart des
// Servers verbinden sich die Geräte neu, und ihre gemeldete Version sagt, was aus dem Update geworden ist.
// running: Der Daemon lädt und prüft. restarting: Das neue Binary liegt auf dem Gerät, der Neustart steht aus.
export interface UpdateStatus {
  state: 'running' | 'restarting' | 'failed'
  target: string | null
  message: string | null
}

// Der Download kann auf einer langsamen Leitung dauern; der Daemon selbst bricht nach 10 Minuten ab.
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

// Stößt das Update an und kehrt sofort zurück. Das Panel liest den Stand über die Geräteliste mit.
// force: Klick im Panel. Ohne force (Auto-Update) wartet der Daemon nach einem Fehlschlag eine Stunde.
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
      // Auto-Update in der Wartezeit nach einem Fehlschlag: kein neuer Fehler, der letzte bleibt stehen.
      // BUSY: Auf dem Gerät läuft schon ein Update aus einer früheren Verbindung.
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

// Auto-Update sofort nachholen, wenn es für ein verbundenes, veraltetes Gerät eingeschaltet wird.
export function autoUpdateIfDue(device: Device, version: string | null | undefined) {
  if (!device.autoUpdate || !hub.isOnline(device.id)) return
  if (daemonUpdateState(version, latestDaemonVersion()) === 'available') startUpdate(device, { force: false })
}

export function watchUpdates(logger: FastifyBaseLogger) {
  log = logger
  // Nach jedem Verbindungsaufbau: Stand aufräumen und, wenn eingeschaltet, das Auto-Update anstoßen.
  // Ein neuer Server bringt meist einen neuen Daemon mit, und nach einem Deploy verbinden sich alle Geräte neu.
  hub.onConnect = (device, info) => {
    const state = daemonUpdateState(info.version, latestDaemonVersion())
    if (state === null) statuses.delete(device.id)
    // Der Daemon lief weiter (z. B. nur die Leitung war weg): Ein angefangenes Update ist dort nicht verloren,
    // der Server weiß aber nichts mehr davon.
    else if (statuses.get(device.id)?.state === 'running') statuses.delete(device.id)
    autoUpdateIfDue(device, info.version)
  }
}

// Gerät gelöscht.
export const forgetUpdate = (deviceId: string) => statuses.delete(deviceId)
