import {
  CTRL_GAIN_MAX,
  CTRL_GAIN_SCALE,
  CTRL_RPM_MAX,
  CtrlReadback,
  CtrlSettings,
  HubSocket,
  LIFT_DISTANCE_MAX,
  LiftDirection,
  PingReport
} from '@shared/types'
import { parseCtrlStatus, parseLiftStatus, parseLine } from './parser'
import { Frame } from './serlink/Frame'
import { LineWriter, SendFrameResult, SerLink, Socket } from './serlink/SerLink'
import { TransportEvents } from './transport'

/** The hub's speed controller socket: status frames in, controller commands out. */
export const CTRL_PROTOCOL = 'CTRL0'
/** The hub's lift socket - only on its MQTT link (SerLink2) */
export const LIFT_PROTOCOL = 'LIFT0'
/** The only lift on the remote hub */
const LIFT_ID = 'B'

export interface HubLinkOptions {
  /** Acquire the LIFT0 socket */
  lift?: boolean
}

/**
 * The ControlHubAA26 hub's SerLink sockets over one line-oriented link.
 * Shared by the serial and MQTT transports - the hub runs the same CTRL0
 * socket on uart2 (SerLink0) and on MQTT (SerLink2).
 */
export class HubLink {
  readonly serLink: SerLink
  readonly ctrl: Socket
  readonly lift: Socket | null

  constructor(
    write: LineWriter,
    private readonly ev: TransportEvents,
    opts: HubLinkOptions = {}
  ) {
    const trace = ev.trace?.bind(ev)
    this.serLink = new SerLink(write, { debug: trace })
    this.ctrl = this.serLink.acquireSocket(CTRL_PROTOCOL, (frame) => {
      const s = parseCtrlStatus(frame.data)
      if (s) this.ev.sample(s)
    })
    this.lift = opts.lift
      ? this.serLink.acquireSocket(LIFT_PROTOCOL, (frame) => {
          const s = parseLiftStatus(frame.data)
          if (s) this.ev.lift(s)
        })
      : null
  }

  /** Handle one received line: a SerLink frame, or else plain JSON / CSV telemetry. */
  receiveLine(line: string): void {
    if (this.serLink.receiveLine(line)) return
    const s = parseLine(line)
    if (s) this.ev.sample(s)
  }

  /**
   * Send a command. A complete SerLink frame (e.g. CTRL0T516006BR0120, as
   * listed in the firmware's main_tasks.cpp) is sent as is; anything else is
   * sent as CTRL0 data (e.g. BR0120) in a 'T' frame. Rejects unless acked OK.
   * Resolves with any data piggybacked on the ack (e.g. BGR -> 0120).
   */
  async send(text: string): Promise<string | undefined> {
    const cmd = text.trim()
    if (!cmd) throw new Error('Empty command')
    const frame = Frame.fromString(cmd)
    const result = frame ? await this.serLink.sendFrame(frame) : await this.ctrl.sendData(cmd, true)
    return checkResult(frame ? frame.protocol : CTRL_PROTOCOL, result)
  }

  /** Read controller B's settings: CTRL0T529003BGA -> CTRL0A529016002000.0150.0148 */
  async ctrlGet(): Promise<CtrlReadback> {
    const data = await this.sendCtrl('BGA')
    const m = /^(\d{6})\.(\d{4})\.(\d{4})$/.exec(data ?? '')
    if (!m) throw new Error(`${CTRL_PROTOCOL}: unexpected BGA reply "${data ?? ''}"`)
    return { gainI: Number(m[1]) / CTRL_GAIN_SCALE, rpm: Number(m[2]), measuredRpm: Number(m[3]) }
  }

  /**
   * Set controller B's integral gain and / or requested RPM (BI002000,
   * BR0120). The gain is read back with BGI, and the result is what the hub
   * now holds; rejects if the read back gain differs from the one sent.
   */
  async ctrlSet(s: Partial<CtrlSettings>): Promise<Partial<CtrlSettings>> {
    const out: Partial<CtrlSettings> = {}
    if (s.gainI !== undefined) {
      const micro = gainToMicro(s.gainI)
      await this.sendCtrl(`BI${String(micro).padStart(6, '0')}`)
      const back = await this.sendCtrl('BGI')
      if (!/^\d{6}$/.test(back ?? '')) throw new Error(`${CTRL_PROTOCOL}: unexpected BGI reply "${back ?? ''}"`)
      if (Number(back) !== micro) {
        throw new Error(`Gain read back as ${Number(back) / CTRL_GAIN_SCALE}, not ${micro / CTRL_GAIN_SCALE}`)
      }
      out.gainI = micro / CTRL_GAIN_SCALE
    }
    if (s.rpm !== undefined) {
      if (!Number.isInteger(s.rpm) || s.rpm < 1 || s.rpm > CTRL_RPM_MAX) {
        throw new Error(`RPM must be a whole number from 1 to ${CTRL_RPM_MAX}`)
      }
      await this.sendCtrl(`BR${String(s.rpm).padStart(4, '0')}`)
      out.rpm = s.rpm
    }
    return out
  }

  /**
   * Start the lift for `distance` edges in `direction`, e.g.
   * LIFT0U645006BSF234 (forward) or LIFT0U645006BSR234 (reverse). Sent as
   * 'U', so this only confirms the frame was published; the hub reports the
   * move's end with an idle status frame. The speed is the controller's
   * (CTRL0 BR), not part of the start.
   */
  async liftStart(distance: number, direction: LiftDirection): Promise<void> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    if (!Number.isInteger(distance) || distance < 1 || distance > LIFT_DISTANCE_MAX) {
      throw new Error(`Lift distance must be a whole number from 1 to ${LIFT_DISTANCE_MAX}`)
    }
    // Checked here too, not just typed: it arrives from the renderer over IPC.
    if (direction !== 'forward' && direction !== 'reverse') {
      throw new Error(`Lift direction must be forward or reverse, not "${String(direction)}"`)
    }
    const dir = direction === 'forward' ? 'F' : 'R'
    checkResult(LIFT_PROTOCOL, await this.lift.sendData(`${LIFT_ID}S${dir}${distance}`, false))
  }

  /**
   * Lower the lift until its ground sensor (PB9) trips, giving up after
   * `maxEdges`: LIFT0U645006BG2000. Sent as 'U'; like a start, the hub
   * reports the move's end with an idle status frame.
   */
  async liftDown(maxEdges: number): Promise<void> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    if (!Number.isInteger(maxEdges) || maxEdges < 1 || maxEdges > LIFT_DISTANCE_MAX) {
      throw new Error(`Lift max edges must be a whole number from 1 to ${LIFT_DISTANCE_MAX}`)
    }
    checkResult(LIFT_PROTOCOL, await this.lift.sendData(`${LIFT_ID}G${maxEdges}`, false))
  }

  /** Stop the lift: LIFT0U645002BX, sent as 'U'. */
  async liftStop(): Promise<void> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    checkResult(LIFT_PROTOCOL, await this.lift.sendData(`${LIFT_ID}X`, false))
  }

  /**
   * Send raw data to a socket (e.g. CTRL0 BGA, LIFT0 BSF234) as a 'T' frame
   * (ack = true: rejects unless acked OK, resolves with any data on the ack)
   * or a 'U' frame.
   */
  async socketSend(protocol: HubSocket, data: string, ack: boolean): Promise<string | undefined> {
    const socket = protocol === CTRL_PROTOCOL ? this.ctrl : protocol === LIFT_PROTOCOL ? this.lift : undefined
    if (socket === undefined) throw new Error(`Unknown socket ${protocol}`)
    if (!socket) throw new Error(`${protocol} is only available over MQTT`)
    const payload = data.trim()
    if (!payload) throw new Error('Empty payload')
    return checkResult(protocol, await socket.sendData(payload, ack))
  }

  /** SerLink PING the hub's LIFT0 socket (LIFT0S...PING). Never rejects once sent. */
  async liftPing(): Promise<PingReport> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    const { result, elapsedMs, error } = await this.lift.ping()
    return { result, elapsedMs, error: error?.message }
  }

  close(): void {
    this.serLink.close()
  }

  /** Send CTRL0 data in a 'T' frame; resolves with any data on the ack. */
  private async sendCtrl(data: string): Promise<string | undefined> {
    return checkResult(CTRL_PROTOCOL, await this.ctrl.sendData(data, true))
  }
}

/** Gain as the hub's integer millionths; throws unless 0..CTRL_GAIN_MAX with at most 6 decimals. */
function gainToMicro(gain: number): number {
  const micro = Math.round(gain * CTRL_GAIN_SCALE)
  if (!Number.isFinite(gain) || micro < 0 || micro > CTRL_GAIN_MAX * CTRL_GAIN_SCALE
    || Math.abs(gain * CTRL_GAIN_SCALE - micro) > 1e-6) {
    throw new Error(`Gain must be 0 to ${CTRL_GAIN_MAX}, with at most 6 decimal places`)
  }
  return micro
}

function checkResult(protocol: string, r: SendFrameResult): string | undefined {
  switch (r.status) {
    case 'ok':
      return r.ackData
    case 'nack':
      throw new Error(`${protocol}: command rejected (ack code ${r.ack?.dataLen})`)
    case 'timeout':
      throw new Error(`${protocol}: no ack from the hub`)
    case 'closed':
      throw new Error('Link closed')
    case 'error':
      throw r.error ?? new Error(`${protocol}: send failed`)
  }
}
