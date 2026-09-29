import { ipcMain, WebContents } from 'electron'
import { CommsConfig, CommsState, IPC, MotorSample } from '@shared/types'
import { getSettings, updateSettings } from '../settings'
import { MqttTransport } from './mqtt'
import { listSerialPorts, SerialTransport } from './serial'
import { SimTransport } from './simulator'
import { Transport, TransportEvents } from './transport'

/** Samples are batched and pushed to the renderer at roughly display rate. */
const FLUSH_MS = 16
/** Drop the oldest samples if the renderer stalls, rather than growing without bound. */
const MAX_PENDING = 20_000

/**
 * Owns the active transport and forwards telemetry to the renderer.
 * All device I/O stays in the main process; the renderer only sees IPC.
 */
class CommsHub {
  private transport: Transport | null = null
  private target: WebContents | null = null
  private pending: MotorSample[] = []
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

    let transport: Transport | null = null
    // Ignore late events from a transport that has since been replaced.
    const live = (): boolean => this.transport === transport
    const ev: TransportEvents = {
      sample: (s) => {
        if (!live()) return
        this.pending.push({ ...s, t: s.t ?? performance.now() - this.t0 })
        if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING)
      },
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

  private flush(): void {
    if (this.pending.length === 0) return
    const batch = this.pending
    this.pending = []
    if (this.target && !this.target.isDestroyed()) this.target.send(IPC.commsSamples, batch)
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
}
