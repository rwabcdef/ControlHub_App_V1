/**
 * SerLink frame, as the ControlHubAA26 firmware's SerLink::Frame (Middlewares/SerLink/Frame).
 *
 *   <protocol:5><type:1><rollCode:3><dataLen:3><data:dataLen>
 *   e.g. CTRL0U001008030.0350
 *
 * On an ack ('A' / 'B') dataLen may instead be a status code (>= ACK_OK), in
 * which case there is no data, e.g. LED01A492900. An ack can also piggyback
 * data instead, e.g. CTRL0A5290040120.
 *
 * Lines are '\n' terminated on the wire; toString() / fromString() work on the
 * line without its terminator (the link adds / strips it).
 */
export class Frame {
  static readonly TYPE_TRANSMISSION = 'T'
  static readonly TYPE_UNIDIRECTION = 'U'
  static readonly TYPE_ACK = 'A'
  static readonly TYPE_RELAY_ACK = 'B'

  static readonly LEN_PROTOCOL = 5
  static readonly LEN_TYPE = 1
  static readonly LEN_ROLLCODE = 3
  static readonly LEN_DATALEN = 3
  static readonly LEN_HEADER = Frame.LEN_PROTOCOL + Frame.LEN_TYPE + Frame.LEN_ROLLCODE + Frame.LEN_DATALEN
  static readonly INDEX_START_TYPE = Frame.LEN_PROTOCOL
  static readonly INDEX_START_ROLLCODE = Frame.INDEX_START_TYPE + Frame.LEN_TYPE
  static readonly INDEX_START_DATALEN = Frame.INDEX_START_ROLLCODE + Frame.LEN_ROLLCODE
  static readonly INDEX_START_DATA = Frame.INDEX_START_DATALEN + Frame.LEN_DATALEN
  static readonly MAX_DATALEN = 64

  /** dataLen (ack status) return codes */
  static readonly ACK_OK = 900

  private static readonly TYPES = new Set([
    Frame.TYPE_TRANSMISSION,
    Frame.TYPE_UNIDIRECTION,
    Frame.TYPE_ACK,
    Frame.TYPE_RELAY_ACK
  ])

  constructor(
    readonly protocol: string,
    readonly type: string,
    readonly rollCode: number = 0,
    /** Length of data, or an ack status code (>= ACK_OK) */
    readonly dataLen: number = 0,
    readonly data: string = ''
  ) {}

  /** True if dataLen is an ack status code rather than a data length. */
  isStatus(): boolean {
    return this.dataLen >= Frame.ACK_OK
  }

  isAck(): boolean {
    return this.type === Frame.TYPE_ACK || this.type === Frame.TYPE_RELAY_ACK
  }

  /**
   * Parse one line (terminator optional). Unlike the firmware's fromString(),
   * the header is validated: returns null for anything that isn't a SerLink
   * frame, so other line formats can share the link. Data beyond dataLen is
   * ignored; data shorter than dataLen is rejected.
   */
  static fromString(raw: string): Frame | null {
    const line = raw.replace(/\r?\n$/, '')
    if (line.length < Frame.LEN_HEADER) return null

    const protocol = line.slice(0, Frame.LEN_PROTOCOL)
    const type = line[Frame.INDEX_START_TYPE]
    const rollStr = line.slice(Frame.INDEX_START_ROLLCODE, Frame.INDEX_START_DATALEN)
    const lenStr = line.slice(Frame.INDEX_START_DATALEN, Frame.INDEX_START_DATA)
    if (!/^[\x21-\x7e]{5}$/.test(protocol) || !Frame.TYPES.has(type)) return null
    if (!/^\d{3}$/.test(rollStr) || !/^\d{3}$/.test(lenStr)) return null

    const rollCode = Number(rollStr)
    const dataLen = Number(lenStr)
    if (dataLen >= Frame.ACK_OK) return new Frame(protocol, type, rollCode, dataLen)

    const data = line.slice(Frame.INDEX_START_DATA, Frame.INDEX_START_DATA + dataLen)
    if (data.length !== dataLen) return null
    return new Frame(protocol, type, rollCode, dataLen, data)
  }

  toString(): string {
    const header = `${this.protocol}${this.type}${Frame.int3d(this.rollCode)}${Frame.int3d(this.dataLen)}`
    return this.isStatus() ? header : header + this.data
  }

  /** Same wraparound as the firmware's Frame::incRollCode(): 0..998. */
  static nextRollCode(rollCode: number): number {
    const next = rollCode + 1
    return next >= 999 ? 0 : next
  }

  private static int3d(n: number): string {
    return String(n).padStart(3, '0')
  }
}
