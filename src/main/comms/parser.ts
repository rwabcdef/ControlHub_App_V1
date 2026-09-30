import { LiftStatus } from '@shared/types'
import { RawSample } from './transport'

/**
 * Decode one line of plain (non-SerLink) telemetry. SerLink frames are
 * handled by HubLink first. Accepted formats:
 *   JSON: {"rpm":1500,"duty":42.5,"current":1.23,"t":123456}   (t optional, ms)
 *   CSV:  1500,42.5,1.23[,123456]                              (rpm,duty,current[,t_ms])
 */
export function parseLine(raw: string): RawSample | null {
  const line = raw.trim()
  if (!line) return null

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

/**
 * Data of the hub's CTRL0 status frame, e.g. 030.0350 from CTRL0U001008030.0350:
 * <pwm %:3>.<rpm:4>. The hub doesn't report current, so it is NaN ("no data").
 */
export function parseCtrlStatus(data: string): RawSample | null {
  const m = /^(\d{3})\.(\d{4})$/.exec(data)
  if (!m) return null
  return { duty: Number(m[1]), rpm: Number(m[2]), current: NaN }
}

/**
 * Data of the hub's LIFT0 status / done frame, e.g. BI000234.000234 from
 * LIFT0U001015BI000234.000234: <lift><M|I|G><travelled:6>.<target:6>.
 * M: moving; I: idle; G: a Down move ended by the ground sensor (PB9), e.g.
 * BG000024.000030 - done after 24 of the 30 edges allowed.
 */
export function parseLiftStatus(data: string): LiftStatus | null {
  const m = /^([A-Z])([MIG])(\d{6})\.(\d{6})$/.exec(data)
  if (!m) return null
  return { lift: m[1], moving: m[2] === 'M', travelled: Number(m[3]), target: Number(m[4]) }
}
