import type { FastifyBaseLogger } from 'fastify'
import type { WebSocket } from 'ws'
import { env } from '../env.js'
import { findDeviceById, findDeviceByToken, saveDeviceInfo, touchLastSeen, type Device } from './devices.js'
import { runningJobs, saveJobResult } from './jobs.js'
import { CloseCode, PROTOCOL_VERSION, type DaemonInfo, type DaemonMessage, type JobSummary, type ServerMessage } from './protocol.js'

export class DeviceOfflineError extends Error {
  constructor(message = 'The device is not connected.') {
    super(message)
  }
}

// Fehler, den der Daemon selbst gemeldet hat (z. B. Datei nicht gefunden).
export class DaemonError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface Connection {
  deviceId: string
  name: string
  socket: WebSocket
  info: DaemonInfo
  connectedAt: Date
  lastHeartbeat: number
  lastPersisted: number
  pending: Map<number, Pending>
  nextRequestId: number
}

type JobWaiter = (summary: JobSummary | null) => void

const HELLO_TIMEOUT_MS = 10_000
// last_seen_at in der Datenbank nur alle 60 s schreiben, im Speicher bei jedem Heartbeat.
const PERSIST_EVERY_MS = 60_000

export class DeviceHub {
  private conns = new Map<string, Connection>()
  private jobWaiters = new Map<string, Set<JobWaiter>>()
  // Jobs, deren exec-Anfrage noch unterwegs ist. Der Abgleich nach einem Reconnect lässt sie aus.
  private startingJobs = new Set<string>()
  private sweeper: NodeJS.Timeout | null = null
  private log: FastifyBaseLogger | null = null
  // Nach jedem erfolgreichen hello, mit dem aktuellen Stand des Geräts aus der Datenbank.
  onConnect: ((device: Device, info: DaemonInfo) => void) | null = null

  get heartbeatIntervalMs() {
    return env.HEARTBEAT_INTERVAL_SECONDS * 1000
  }

  get heartbeatTimeoutMs() {
    return env.HEARTBEAT_TIMEOUT_SECONDS * 1000
  }

  start(log: FastifyBaseLogger) {
    this.log = log
    this.sweeper = setInterval(() => this.sweep(), 5_000)
    this.sweeper.unref()
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper)
    for (const conn of this.conns.values()) conn.socket.close(CloseCode.Shutdown, 'server shutdown')
  }

  isOnline(deviceId: string) {
    return this.conns.has(deviceId)
  }

  connection(deviceId: string) {
    const conn = this.conns.get(deviceId)
    return conn ? { connectedAt: conn.connectedAt, lastSeen: new Date(conn.lastHeartbeat), info: conn.info } : null
  }

  // Trennt ein Gerät sofort, z. B. nach Deaktivieren, Löschen oder neuem Token.
  disconnect(deviceId: string, code: number, reason: string) {
    const conn = this.conns.get(deviceId)
    if (!conn) return
    this.drop(conn, new DeviceOfflineError('The connection to the device was closed.'))
    conn.socket.close(code, reason)
  }

  attach(socket: WebSocket, ip: string) {
    const state: { conn: Connection | null } = { conn: null }
    let queue = Promise.resolve()

    const helloTimer = setTimeout(() => socket.close(CloseCode.HelloTimeout, 'hello timeout'), HELLO_TIMEOUT_MS)

    socket.on('message', (data, isBinary) => {
      if (isBinary) return socket.close(CloseCode.BadMessage, 'binary not supported')
      // Nacheinander abarbeiten, damit hello sicher vor allem anderen fertig ist.
      queue = queue
        .then(() => this.onMessage(socket, state, data.toString(), ip, helloTimer))
        .catch((err) => this.log?.error({ err }, 'Daemon message failed'))
    })

    socket.on('close', (code) => {
      clearTimeout(helloTimer)
      const conn = state.conn
      if (!conn) return
      if (this.conns.get(conn.deviceId) === conn) {
        this.drop(conn, new DeviceOfflineError('The connection to the device was lost.'))
        this.log?.info({ device: conn.name, code }, 'Device disconnected')
      }
    })

    socket.on('error', (err) => this.log?.warn({ err }, 'WebSocket error'))
  }

  private async onMessage(socket: WebSocket, state: { conn: Connection | null }, raw: string, ip: string, helloTimer: NodeJS.Timeout) {
    let msg: DaemonMessage
    try {
      msg = JSON.parse(raw)
    } catch {
      return socket.close(CloseCode.BadMessage, 'invalid json')
    }

    if (!state.conn) {
      if (msg.type !== 'hello' || typeof msg.token !== 'string') return socket.close(CloseCode.BadMessage, 'expected hello')
      state.conn = await this.onHello(socket, msg, ip)
      if (state.conn) clearTimeout(helloTimer)
      return
    }

    const conn = state.conn
    switch (msg.type) {
      case 'heartbeat': {
        conn.lastHeartbeat = Date.now()
        this.send(conn.socket, { type: 'heartbeat_ack' })
        if (conn.lastHeartbeat - conn.lastPersisted > PERSIST_EVERY_MS) {
          conn.lastPersisted = conn.lastHeartbeat
          await touchLastSeen(conn.deviceId, new Date(conn.lastHeartbeat))
        }
        return
      }
      case 'response': {
        const pending = conn.pending.get(msg.id)
        if (!pending) return
        conn.pending.delete(msg.id)
        clearTimeout(pending.timer)
        if (msg.ok) pending.resolve(msg.result)
        else pending.reject(new DaemonError(msg.error.message, msg.error.code))
        return
      }
      case 'job_exit': {
        conn.lastHeartbeat = Date.now()
        await this.onJobEnd(conn.deviceId, msg.job)
        return
      }
      default:
        this.log?.warn({ type: (msg as { type?: string }).type }, 'Unknown daemon message')
    }
  }

  private async onHello(socket: WebSocket, msg: Extract<DaemonMessage, { type: 'hello' }>, ip: string): Promise<Connection | null> {
    const device = await findDeviceByToken(msg.token)
    if (!device) {
      this.log?.warn({ ip }, 'Rejected daemon with unknown token')
      socket.close(CloseCode.InvalidToken, 'invalid token')
      return null
    }
    if (!device.enabled) {
      socket.close(CloseCode.Disabled, 'device disabled')
      return null
    }
    if (socket.readyState !== socket.OPEN) return null

    const previous = this.conns.get(device.id)
    if (previous) {
      this.drop(previous, new DeviceOfflineError('The device reconnected.'))
      previous.socket.close(CloseCode.Replaced, 'replaced by new connection')
    }

    const now = new Date()
    const conn: Connection = {
      deviceId: device.id,
      name: device.name,
      socket,
      info: msg.info,
      connectedAt: now,
      lastHeartbeat: now.getTime(),
      lastPersisted: now.getTime(),
      pending: new Map(),
      nextRequestId: 1,
    }
    this.conns.set(device.id, conn)

    // Während der Token-Abfrage kann das Panel den Token erneuert, das Gerät deaktiviert oder gelöscht haben.
    // disconnect() fand da noch keine Verbindung, deshalb jetzt gegen den aktuellen Stand prüfen.
    const fresh = await findDeviceById(device.id)
    if (!fresh || fresh.tokenHash !== device.tokenHash || !fresh.enabled) {
      this.drop(conn, new DeviceOfflineError('The device credentials just changed.'))
      socket.close(fresh && fresh.tokenHash === device.tokenHash ? CloseCode.Disabled : CloseCode.InvalidToken, 'credentials changed')
      return null
    }
    await saveDeviceInfo(device.id, msg.info, now)

    this.send(socket, {
      type: 'welcome',
      deviceId: device.id,
      name: device.name,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      heartbeatTimeoutMs: this.heartbeatTimeoutMs,
    })
    if (msg.protocol !== PROTOCOL_VERSION) {
      this.log?.warn({ device: device.name, protocol: msg.protocol }, 'Daemon speaks a different protocol version')
    }
    this.log?.info({ device: device.name, ip, version: msg.info.version }, 'Device connected')

    await this.reconcile(device.id, Array.isArray(msg.jobs) ? msg.jobs : [])
    try {
      this.onConnect?.(fresh, msg.info)
    } catch (err) {
      this.log?.error({ err }, 'onConnect failed')
    }
    return conn
  }

  // Nach einem Reconnect: Was in der Datenbank noch läuft, mit dem Stand des Daemons abgleichen.
  private async reconcile(deviceId: string, daemonJobs: JobSummary[]) {
    const known = new Map(daemonJobs.map((j) => [j.id, j]))
    for (const { id } of await runningJobs(deviceId)) {
      if (this.startingJobs.has(id)) continue
      const job = known.get(id)
      if (!job) {
        await this.onJobEnd(deviceId, {
          id,
          status: 'lost',
          exitCode: null,
          signal: null,
          error: 'The daemon no longer knows this job, it was probably restarted.',
          finishedAt: new Date().toISOString(),
          durationMs: null,
        })
      } else if (job.status !== 'running') {
        await this.onJobEnd(deviceId, job)
      }
    }
    // Wartende Vordergrund-Aufrufe, deren Job während der Trennung fertig wurde.
    for (const job of daemonJobs) {
      if (job.status !== 'running' && this.jobWaiters.has(job.id)) this.notifyJob(job.id, job)
    }
  }

  private async onJobEnd(deviceId: string, job: Parameters<typeof saveJobResult>[1] & Partial<JobSummary>) {
    await saveJobResult(deviceId, job)
    this.notifyJob(job.id, job as JobSummary)
  }

  private notifyJob(jobId: string, summary: JobSummary | null) {
    const waiters = this.jobWaiters.get(jobId)
    if (!waiters) return
    for (const waiter of [...waiters]) waiter(summary)
  }

  markStarting(jobId: string) {
    this.startingJobs.add(jobId)
  }

  unmarkStarting(jobId: string) {
    this.startingJobs.delete(jobId)
  }

  // Vor dem exec registrieren, damit auch sehr schnelle Befehle nicht verpasst werden.
  waitForJobEnd(jobId: string, timeoutMs: number) {
    let finish: JobWaiter = () => {}
    const promise = new Promise<JobSummary | null>((resolve) => {
      const set = this.jobWaiters.get(jobId) ?? new Set<JobWaiter>()
      const timer = setTimeout(() => finish(null), timeoutMs)
      finish = (summary) => {
        clearTimeout(timer)
        set.delete(finish)
        if (set.size === 0) this.jobWaiters.delete(jobId)
        resolve(summary)
      }
      set.add(finish)
      this.jobWaiters.set(jobId, set)
    })
    return { promise, cancel: () => finish(null) }
  }

  request<T>(deviceId: string, method: string, params: unknown, timeoutMs = 30_000): Promise<T> {
    const conn = this.conns.get(deviceId)
    if (!conn) return Promise.reject(new DeviceOfflineError())
    const id = conn.nextRequestId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        conn.pending.delete(id)
        reject(new DaemonError(`The device did not answer within ${Math.round(timeoutMs / 1000)} s.`, 'TIMEOUT'))
      }, timeoutMs)
      conn.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      conn.socket.send(JSON.stringify({ type: 'request', id, method, params } satisfies ServerMessage), (err) => {
        if (!err) return
        clearTimeout(timer)
        conn.pending.delete(id)
        reject(new DeviceOfflineError('The request could not be sent to the device.'))
      })
    })
  }

  private drop(conn: Connection, reason: Error) {
    if (this.conns.get(conn.deviceId) === conn) this.conns.delete(conn.deviceId)
    for (const pending of conn.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    conn.pending.clear()
    touchLastSeen(conn.deviceId, new Date(conn.lastHeartbeat)).catch((err) => this.log?.error({ err }, 'Could not save last_seen_at'))
  }

  private sweep() {
    const now = Date.now()
    for (const conn of this.conns.values()) {
      if (now - conn.lastHeartbeat <= this.heartbeatTimeoutMs) continue
      this.log?.warn({ device: conn.name }, 'Heartbeat missing, device is considered offline')
      this.drop(conn, new DeviceOfflineError('The device stopped responding.'))
      conn.socket.terminate()
    }
  }

  private send(socket: WebSocket, msg: ServerMessage) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
  }
}

export const hub = new DeviceHub()
