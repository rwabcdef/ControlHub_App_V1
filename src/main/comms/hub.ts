import { app, ipcMain, WebContents } from 'electron'
import {
  CommsConfig, CommsState, ControlHubSettings, CTRL_RPM_MAX, CtrlDirection, CtrlReadback, CtrlSettings, HubSocket, IPC,
  LIFT_DISTANCE_MAX, LiftDirection, MotorSample, MqttLogLine, PingReport
} from '@shared/types'
import { getSettings, updateSettings } from '../settings'
import { MqttTransport } from './mqtt'
import { listSerialPorts, SerialTransport } from './serial'
import { SimTransport } from './simulator'
import { Transport, TransportEvents } from './transport'

/** Samples are batched and pushed to the renderer at roughly display rate. */
const FLUSH_MS = 16
/** Drop the oldest samples if the renderer stalls, rather than growing without bound. */
const MAX_PENDING = 20_000
/** The same for MQTT log lines, which go out with the samples */
const MAX_PENDING_LOG = 5_000
/** Trace SerLink traffic to the terminal and the renderer's DevTools console: in dev, or with SERLINK_DEBUG set. */
const SERLINK_TRACE = !app.isPackaged || !!process.env.SERLINK_DEBUG

/**
 * Owns the active transport and forwards telemetry to the renderer.
 * All device I/O stays in the main process; the renderer only sees IPC.
 */
class CommsHub {
  private transport: Transport | null = null
  private target: WebContents | null = null
  private pending: MotorSample[] = []
  private pendingLog: MqttLogLine[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private t0 = 0
  private state: CommsState = { status: 'disconnected', kind: getSettings().comms.kind }

  attach(wc: WebContents): void {
    this.target = wc
    wc.on('destroyed', () => {
      if (this.target === wc) this.target = null
    })
  }

  getState(): CommsState {
    return this.state
  }

  async connect(cfg: CommsConfig): Promise<void> {
    await this.disconnect()
    this.setState({ status: 'connecting', kind: cfg.kind })
    this.t0 = performance.now()
    this.pending = []
    this.pendingLog = []

    let transport: Transport | null = null
    // Ignore late events from a transport that has since been replaced.
    const live = (): boolean => this.transport === transport
    const ev: TransportEvents = {
      sample: (s) => {
        if (!live()) return
        this.pending.push({ ...s, t: s.t ?? performance.now() - this.t0 })
        if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING)
      },
      lift: (s) => {
        if (live() && this.target && !this.target.isDestroyed()) this.target.send(IPC.liftStatus, s)
      },
      hub: (s) => {
        if (live() && this.target && !this.target.isDestroyed()) this.target.send(IPC.hubState, s)
      },
      mqttLog: (line) => {
        if (!live()) return
        this.pendingLog.push(line)
        if (this.pendingLog.length > MAX_PENDING_LOG) {
          this.pendingLog.splice(0, this.pendingLog.length - MAX_PENDING_LOG)
        }
      },
      trace: SERLINK_TRACE
        ? (msg): void => {
            if (!live()) return
            const line = `${new Date().toISOString().slice(11, 23)} ${cfg.kind} ${msg}`
            console.log(`[SerLink] ${line}`)
            if (this.target && !this.target.isDestroyed()) this.target.send(IPC.serlinkTrace, line)
          }
        : undefined,
      error: (err) => live() && this.setState({ status: 'error', kind: cfg.kind, error: err.message }),
      reconnected: () => live() && this.setState({ status: 'connected', kind: cfg.kind }),
      close: () => {
        if (live()) void this.disconnect()
      }
    }

    transport =
      cfg.kind === 'serial'
        ? new SerialTransport(cfg.serial, ev)
        : cfg.kind === 'mqtt'
          ? new MqttTransport(cfg.mqtt, ev)
          : new SimTransport(ev)
    this.transport = transport

    try {
      await transport.open()
    } catch (err) {
      this.transport = null
      await transport.close().catch(() => {})
      this.setState({ status: 'error', kind: cfg.kind, error: (err as Error).message })
      return
    }
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS)
    this.setState({ status: 'connected', kind: cfg.kind })
  }

  async disconnect(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flushTimer = null
    const t = this.transport
    this.transport = null
    if (t) {
      await t.close().catch(() => {})
      this.flush()
      this.setState({ status: 'disconnected', kind: this.state.kind })
    }
  }

  async send(text: string): Promise<string | undefined> {
    if (!this.transport) throw new Error('Not connected')
    return this.transport.send(text)
  }

  async socketSend(protocol: HubSocket, data: string, ack: boolean): Promise<string | undefined> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.socketSend) throw new Error('Socket commands need a serial or MQTT connection')
    return this.transport.socketSend(protocol, data, ack)
  }

  async ctrlGet(): Promise<CtrlReadback> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.ctrlGet) throw new Error('Controller settings need a serial or MQTT connection')
    return this.transport.ctrlGet()
  }

  async ctrlSet(s: Partial<CtrlSettings>): Promise<Partial<CtrlSettings>> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.ctrlSet) throw new Error('Controller settings need a serial or MQTT connection')
    return this.transport.ctrlSet(s)
  }

  async ctrlStart(): Promise<void> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.ctrlStart) throw new Error('Control runs need a serial or MQTT connection')
    await this.transport.ctrlStart()
  }

  async ctrlStop(): Promise<void> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.ctrlStop) throw new Error('Control runs need a serial or MQTT connection')
    await this.transport.ctrlStop()
  }

  async ctrlSetDirection(direction: CtrlDirection): Promise<void> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.ctrlSetDirection) throw new Error('Control runs need a serial or MQTT connection')
    await this.transport.ctrlSetDirection(direction)
  }

  async liftStart(distance: number, direction: LiftDirection): Promise<void> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.liftStart) throw new Error('Lift control needs an MQTT connection')
    await this.transport.liftStart(distance, direction)
  }

  async liftDown(maxEdges: number): Promise<void> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.liftDown) throw new Error('Lift control needs an MQTT connection')
    await this.transport.liftDown(maxEdges)
  }

  async liftStop(): Promise<void> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.liftStop) throw new Error('Lift control needs an MQTT connection')
    await this.transport.liftStop()
  }

  async liftPing(): Promise<PingReport> {
    if (!this.transport) throw new Error('Not connected')
    if (!this.transport.liftPing) throw new Error('Lift ping needs an MQTT connection')
    return this.transport.liftPing()
  }

  private flush(): void {
    if (this.pending.length > 0) {
      const batch = this.pending
      this.pending = []
      if (this.target && !this.target.isDestroyed()) this.target.send(IPC.commsSamples, batch)
    }
    if (this.pendingLog.length > 0) {
      const lines = this.pendingLog
      this.pendingLog = []
      if (this.target && !this.target.isDestroyed()) this.target.send(IPC.mqttLog, lines)
    }
  }

  private setState(s: CommsState): void {
    this.state = s
    if (this.target && !this.target.isDestroyed()) this.target.send(IPC.commsState, s)
  }
}

export const commsHub = new CommsHub()

export function registerCommsIpc(): void {
  ipcMain.handle(IPC.commsListPorts, () => listSerialPorts())
  ipcMain.handle(IPC.commsGetConfig, () => getSettings().comms)
  ipcMain.handle(IPC.commsSetConfig, (_e, cfg: CommsConfig) => updateSettings({ comms: cfg }).comms)
  ipcMain.handle(IPC.commsGetState, () => commsHub.getState())
  ipcMain.handle(IPC.commsConnect, (_e, cfg?: CommsConfig) => commsHub.connect(cfg ?? getSettings().comms))
  ipcMain.handle(IPC.commsDisconnect, () => commsHub.disconnect())
  ipcMain.handle(IPC.commsSend, (_e, text: string) => commsHub.send(String(text)))
  ipcMain.handle(IPC.socketSend, (_e, protocol: HubSocket, data: string, ack: boolean) =>
    commsHub.socketSend(protocol, String(data), !!ack)
  )
  ipcMain.handle(IPC.ctrlGet, () => commsHub.ctrlGet())
  ipcMain.handle(IPC.ctrlSet, (_e, s: Partial<CtrlSettings>) =>
    commsHub.ctrlSet({
      gainI: s?.gainI === undefined ? undefined : Number(s.gainI),
      rpm: s?.rpm === undefined ? undefined : Number(s.rpm),
      maxDuty: s?.maxDuty === undefined ? undefined : Number(s.maxDuty)
    })
  )
  ipcMain.handle(IPC.ctrlStart, () => commsHub.ctrlStart())
  ipcMain.handle(IPC.ctrlStop, () => commsHub.ctrlStop())
  // direction is validated in HubLink.ctrlSetDirection() - it is untrusted input from the renderer
  ipcMain.handle(IPC.ctrlSetDirection, (_e, direction: CtrlDirection) => commsHub.ctrlSetDirection(direction))
  ipcMain.handle(IPC.controlHubGet, () => getSettings().controlHub)
  ipcMain.handle(IPC.controlHubSet, (_e, s: Partial<ControlHubSettings>) => {
    // Untrusted input from the renderer: check each field given, keep the rest.
    const next = { ...getSettings().controlHub }
    if (s?.liftDistance !== undefined) {
      const liftDistance = Number(s.liftDistance)
      if (!Number.isInteger(liftDistance) || liftDistance < 1 || liftDistance > LIFT_DISTANCE_MAX) {
        throw new Error(`Lift distance must be a whole number from 1 to ${LIFT_DISTANCE_MAX}`)
      }
      next.liftDistance = liftDistance
    }
    if (s?.dialRpmMax !== undefined) {
      const dialRpmMax = Number(s.dialRpmMax)
      if (!Number.isInteger(dialRpmMax) || dialRpmMax < 1 || dialRpmMax > CTRL_RPM_MAX) {
        throw new Error(`Dial max speed must be a whole number from 1 to ${CTRL_RPM_MAX}`)
      }
      next.dialRpmMax = dialRpmMax
    }
    return updateSettings({ controlHub: next }).controlHub
  })
  // direction is validated in HubLink.liftStart() - it is untrusted input from the renderer
  ipcMain.handle(IPC.liftStart, (_e, distance: number, direction: LiftDirection) =>
    commsHub.liftStart(Number(distance), direction)
  )
  ipcMain.handle(IPC.liftDown, (_e, maxEdges: number) => commsHub.liftDown(Number(maxEdges)))
  ipcMain.handle(IPC.liftStop, () => commsHub.liftStop())
  ipcMain.handle(IPC.liftPing, () => commsHub.liftPing())
}
