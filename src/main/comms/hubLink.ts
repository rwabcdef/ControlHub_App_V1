import { parseCtrlStatus, parseLine } from './parser'
import { Frame } from './serlink/Frame'
import { LineWriter, SendFrameResult, SerLink, Socket } from './serlink/SerLink'
import { TransportEvents } from './transport'

/** The hub's speed controller socket: status frames in, controller commands out. */
export const CTRL_PROTOCOL = 'CTRL0'

/**
 * The ControlHubAA26 hub's SerLink sockets over one line-oriented link.
 * Shared by the serial and MQTT transports - the hub runs the same CTRL0
 * socket on uart2 (SerLink0) and on MQTT (SerLink2).
 */
export class HubLink {
  readonly serLink: SerLink
  readonly ctrl: Socket

  constructor(
    write: LineWriter,
    private readonly ev: TransportEvents
  ) {
    this.serLink = new SerLink(write, {
      debug: process.env.SERLINK_DEBUG ? (msg): void => console.log(`[SerLink] ${msg}`) : undefined
    })
    this.ctrl = this.serLink.acquireSocket(CTRL_PROTOCOL, (frame) => {
      const s = parseCtrlStatus(frame.data)
      if (s) this.ev.sample(s)
    })
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
