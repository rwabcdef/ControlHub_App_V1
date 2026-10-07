/**
 * The hub's CTRL0 status frame anywhere in a line, e.g. CTRL0U001015CF030.0350.1234
 * as it arrives on MQTT, or "rx CTRL0U001015CF030..." in the SerLink trace. Group 1
 * is the mode: I idle, C control, L lift.
 */
const STATUS_FRAME = /CTRL0U\d{6}([ICL])[FR]\d{3}\.\d{4}\.\d{4}/

/** Keep one status frame in this many while the hub runs */
export const STATUS_KEEP_EVERY = 10

/**
 * Thins the hub's status frames out of a log. They come 4 times a second
 * while the hub runs, and would bury everything else in the MQTT log and the
 * SerLink trace. Of a run's frames (mode C or L) the 1st, 11th, 21st... are
 * kept; the Idle frame the hub sends once when the run stops is always kept,
 * and starts the count again. Every other line is kept. Telemetry is not
 * affected - this is for logs only. One instance per log.
 */
export class StatusThinner {
  private count = 0

  keep(line: string): boolean {
    const m = STATUS_FRAME.exec(line)
    if (!m) return true
    if (m[1] === 'I') {
      this.count = 0
      return true
    }
    return this.count++ % STATUS_KEEP_EVERY === 0
  }
}
