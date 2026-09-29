import { Frame } from './Frame'

/**
 * SerLink for the desktop app - a port of the Arduino project's node_js
 * SerLink (PC/Transport/node_js/src/SerLink/SerLink.ts), behaving as the
 * ControlHubAA26 firmware's Reader / Writer / Socket do.
 *
 * It does no I/O itself, so the same stack runs over any line-oriented link
 * (serial, MQTT, ...): the link hands each received line to receiveLine() and
 * SerLink writes lines with the LineWriter it was constructed with.
 *
 *   'T' received -> 'A' (ACK_OK) sent straight back, then delivered to the socket
 *   'U' received -> delivered to the socket
 *   'A' / 'B' received -> matched against the 'T' frame being waited on
 *
 * As with the firmware Writer, frames are sent one at a time: a 'T' frame is
 * not followed by the next send until it has been acked or has timed out.
 */

/** Writes one line; the terminator is added by the link. */
export type LineWriter = (line: string) => Promise<void>

export type FrameHandler = (frame: Frame) => void

/** Same as the firmware's WRITER_ACK_TIMEOUT_MS */
export const ACK_TIMEOUT_MS = 1000
/** SERLINK_RELAY__ACK_TIMEOUT_MS (1500) plus some slack for the link */
export const RELAY_ACK_TIMEOUT_MS = 2000

export type SendStatus =
  /** Sent ('U' / 'B'), or acked with ACK_OK or with data */
  | 'ok'
  /** Acked with a status code other than ACK_OK (see `ack.dataLen`) */
  | 'nack'
  | 'timeout'
  /** The link failed to write the frame (see `error`) */
  | 'error'
  /** SerLink was closed before the frame was sent or acked */
  | 'closed'

export interface SendFrameResult {
  status: SendStatus
  /** The 'A' (or with relayAck, 'B') frame that completed the send */
  ack?: Frame
  /** Data piggybacked on the ack, e.g. '0120' from CTRL0A5290040120 */
  ackData?: string
  error?: Error
}

export interface SendOptions {
  /**
   * For a 'T' frame to a relayed socket (see the firmware's SerlinkRelay):
   * after the relaying hub's 'A', also wait for the far end's relay ack ('B')
   * and complete with that.
   */
  relayAck?: boolean
  ackTimeoutMs?: number
  relayAckTimeoutMs?: number
}

export interface SerLinkOptions {
  /** Debug trace; nothing is logged if unset */
  debug?: (msg: string) => void
}

export class Socket {
  private rollCode: number

  constructor(
    private readonly link: SerLink,
    readonly protocol: string,
    initialRollCode: number,
    private onReceive: FrameHandler | null
  ) {
    this.rollCode = initialRollCode
  }

  /** Send data as a 'T' frame (ack = true, completes on the ack) or a 'U' frame. */
  sendData(data: string, ack: boolean, opts: SendOptions = {}): Promise<SendFrameResult> {
    if (data.length > Frame.MAX_DATALEN) {
      return Promise.resolve({
        status: 'error',
        error: new Error(`${this.protocol}: data longer than ${Frame.MAX_DATALEN} characters`)
      })
    }
    const type = ack ? Frame.TYPE_TRANSMISSION : Frame.TYPE_UNIDIRECTION
    const frame = new Frame(this.protocol, type, this.rollCode, data.length, data)
    this.rollCode = Frame.nextRollCode(this.rollCode)
    return this.link.sendFrame(frame, opts)
  }

  setOnReceive(handler: FrameHandler | null): void {
    this.onReceive = handler
  }

  /** Called by SerLink with the 'T' and 'U' frames received for this socket. */
  deliver(frame: Frame): void {
    this.onReceive?.(frame)
  }
}

type AckWaiter = {
  frame: Frame
  type: string
  resolve: (ack: Frame | null) => void
  timer: NodeJS.Timeout
}

/** Sends frames one at a time, waiting for the ack of each 'T' frame. */
class Writer {
  private queue: Promise<unknown> = Promise.resolve()
  private waiter: AckWaiter | null = null
  private closed = false

  constructor(
    private readonly write: LineWriter,
    private readonly debug: (msg: string) => void
  ) {}

  send(frame: Frame, opts: SendOptions): Promise<SendFrameResult> {
    const run = (): Promise<SendFrameResult> => this.transmit(frame, opts)
    const result = this.queue.then(run, run)
    this.queue = result
    return result
  }

  /** Called by the Reader for each 'A' / 'B' frame; false if nothing was waiting on it. */
  onAck(ack: Frame): boolean {
    const w = this.waiter
    if (!w || ack.type !== w.type || ack.protocol !== w.frame.protocol || ack.rollCode !== w.frame.rollCode) {
      return false
    }
    this.finishWait(ack)
    return true
  }

  close(): void {
    this.closed = true
    this.finishWait(null)
  }

  private async transmit(frame: Frame, opts: SendOptions): Promise<SendFrameResult> {
    if (this.closed) return { status: 'closed' }
    this.debug(`tx ${frame}`)
    try {
      await this.write(frame.toString())
    } catch (err) {
      return { status: 'error', error: err as Error }
    }
    if (frame.type !== Frame.TYPE_TRANSMISSION) return { status: 'ok' }

    let ack = await this.waitAck(frame, Frame.TYPE_ACK, opts.ackTimeoutMs ?? ACK_TIMEOUT_MS)
    if (ack && opts.relayAck && ack.dataLen === Frame.ACK_OK) {
      const relayAck = await this.waitAck(frame, Frame.TYPE_RELAY_ACK, opts.relayAckTimeoutMs ?? RELAY_ACK_TIMEOUT_MS)
      if (!relayAck) return this.closed ? { status: 'closed' } : { status: 'timeout', ack }
      ack = relayAck
    }
    if (!ack) {
      if (this.closed) return { status: 'closed' }
      this.debug(`ack timeout ${frame}`)
      return { status: 'timeout' }
    }
    if (ack.isStatus()) return { status: ack.dataLen === Frame.ACK_OK ? 'ok' : 'nack', ack }
    return { status: 'ok', ack, ackData: ack.data }
  }

  private waitAck(frame: Frame, type: string, timeoutMs: number): Promise<Frame | null> {
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finishWait(null), timeoutMs)
      this.waiter = { frame, type, resolve, timer }
    })
  }

  private finishWait(ack: Frame | null): void {
    const w = this.waiter
    if (!w) return
    this.waiter = null
    clearTimeout(w.timer)
    w.resolve(ack)
  }
}

export class SerLink {
  private readonly sockets = new Map<string, Socket>()
  private readonly writer: Writer
  private readonly debug: (msg: string) => void

  constructor(
    private readonly write: LineWriter,
    opts: SerLinkOptions = {}
  ) {
    this.debug = opts.debug ?? ((): void => {})
    this.writer = new Writer(write, this.debug)
  }

  /** Acquire the socket for a protocol (5 characters, e.g. 'CTRL0'). Throws if it's already acquired. */
  acquireSocket(protocol: string, onReceive: FrameHandler | null = null, initialRollCode = 0): Socket {
    if (protocol.length !== Frame.LEN_PROTOCOL) {
      throw new Error(`SerLink protocol must be ${Frame.LEN_PROTOCOL} characters: "${protocol}"`)
    }
    if (this.sockets.has(protocol)) throw new Error(`SerLink socket ${protocol} already acquired`)
    const socket = new Socket(this, protocol, initialRollCode, onReceive)
    this.sockets.set(protocol, socket)
    return socket
  }

  releaseSocket(socket: Socket): void {
    if (this.sockets.get(socket.protocol) === socket) this.sockets.delete(socket.protocol)
  }

  /** Send a complete frame, as is (roll code included). Used by Socket; also for raw frames. */
  sendFrame(frame: Frame, opts: SendOptions = {}): Promise<SendFrameResult> {
    return this.writer.send(frame, opts)
  }

  /**
   * The Reader: handle one line received from the link. Returns false if the
   * line isn't a SerLink frame, so the caller can try other formats.
   */
  receiveLine(line: string): boolean {
    const frame = Frame.fromString(line.trim())
    if (!frame) return false
    this.debug(`rx ${frame}`)

    switch (frame.type) {
      case Frame.TYPE_TRANSMISSION: {
        // Acked before delivery, as the firmware Reader does, so the ack always
        // precedes anything the socket sends in response. Written directly -
        // not queued behind a 'T' frame of ours that may be waiting for its own ack.
        const ack = new Frame(frame.protocol, Frame.TYPE_ACK, frame.rollCode, Frame.ACK_OK)
        this.write(ack.toString()).catch((err) => this.debug(`ack write failed: ${(err as Error).message}`))
        this.deliver(frame)
        break
      }
      case Frame.TYPE_UNIDIRECTION:
        this.deliver(frame)
        break
      case Frame.TYPE_ACK:
      case Frame.TYPE_RELAY_ACK:
        // e.g. the 'A' that precedes a relay's 'B', when relayAck wasn't asked for
        if (!this.writer.onAck(frame)) this.debug(`unmatched ack ${frame}`)
        break
    }
    return true
  }

  /** Stop sending: queued and in-flight sends complete with status 'closed'. */
  close(): void {
    this.writer.close()
    this.sockets.clear()
  }

  private deliver(frame: Frame): void {
    const socket = this.sockets.get(frame.protocol)
    if (socket) socket.deliver(frame)
    else this.debug(`no socket for ${frame.protocol}`)
  }
}
