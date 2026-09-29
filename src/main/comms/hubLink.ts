import { LIFT_DISTANCE_MAX } from '@shared/types'
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

  /**
   * Start the lift forward for `distance` edges, e.g. LIFT0U645006BSF234.
   * Sent as 'U', so this only confirms the frame was published; the hub
   * reports the move's end with an idle status frame.
   */
  async liftStart(distance: number): Promise<void> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    if (!Number.isInteger(distance) || distance < 1 || distance > LIFT_DISTANCE_MAX) {
      throw new Error(`Lift distance must be a whole number from 1 to ${LIFT_DISTANCE_MAX}`)
    }
    checkResult(LIFT_PROTOCOL, await this.lift.sendData(`${LIFT_ID}SF${distance}`, false))
  }

  close(): void {
    this.serLink.close()
  }
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
