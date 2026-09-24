import { RawSample } from './transport'

/**
 * Decode one line of telemetry. Accepted formats (adapt to your firmware):
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
