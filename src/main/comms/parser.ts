import { RawSample } from './transport'

/** SerLink header: 5 protocol, 1 type, 3 roll code, 3 data length. */
const SERLINK_HEADER_LEN = 12

/**
 * Decode one line of telemetry. Accepted formats:
 *   SerLink (ControlHubAA26 hub): CTRL0U001008030.0350
 *     protocol CTRL0, type U (unsolicited), roll code, data length, data <pwm %>.<rpm>.
 *     The hub doesn't report current, so it is NaN (shown as "no data").
 *   JSON: {"rpm":1500,"duty":42.5,"current":1.23,"t":123456}   (t optional, ms)
 *   CSV:  1500,42.5,1.23[,123456]                              (rpm,duty,current[,t_ms])
 */
export function parseLine(raw: string): RawSample | null {
  const line = raw.trim()
  if (!line) return null

  if (line.startsWith('CTRL0')) return parseSerLinkStatus(line)

  if (line.startsWith('{')) {
    try {
      const o = JSON.parse(line)
      const rpm = Number(o.rpm)
      const duty = Number(o.duty)
      const current = Number(o.current)
      if (![rpm, duty, current].every(Number.isFinite)) return null
      const t = Number(o.t)
      return { rpm, duty, current, t: Number.isFinite(t) ? t : undefined }
    } catch {
      return null
    }
  }

  const parts = line.split(/[,;\s]+/).map(Number)
  if (parts.length < 3 || !parts.slice(0, 3).every(Number.isFinite)) return null
  const [rpm, duty, current, t] = parts
  return { rpm, duty, current, t: Number.isFinite(t) ? t : undefined }
}

/** CTRL0 status frame (fixed offsets, as the hub's Frame::fromString() parses). Acks etc. are ignored. */
function parseSerLinkStatus(line: string): RawSample | null {
  if (line.length < SERLINK_HEADER_LEN || line[5] !== 'U') return null
  const dataLen = Number(line.slice(9, 12))
  if (!Number.isInteger(dataLen)) return null
  const m = /^(\d{3})\.(\d{4})$/.exec(line.slice(SERLINK_HEADER_LEN, SERLINK_HEADER_LEN + dataLen))
  if (!m) return null
  return { duty: Number(m[1]), rpm: Number(m[2]), current: NaN }
}
