import type { MotorField, MotorSample } from '@shared/types'

/** Keep up to this many samples (e.g. 60 s at 1 kHz). */
const MAX_POINTS = 60_000

/**
 * High-rate telemetry buffer that lives OUTSIDE React state.
 *
 * Samples arrive in batches over IPC (~60 Hz). Pushing them through React
 * state would re-render the tree at the data rate; instead, visual components
 * register a per-animation-frame callback and draw imperatively (uPlot.setData,
 * SVG attribute updates). Callbacks run at most once per frame and only when
 * new data has arrived.
 */
class TelemetryStore {
  /** Columnar arrays, time in seconds - the layout uPlot consumes directly */
  readonly t: number[] = []
  readonly rpm: number[] = []
  readonly duty: number[] = []
  readonly current: number[] = []

  latest: MotorSample | null = null
  /** Measured incoming sample rate, Hz */
  rate = 0

  private version = 0
  private drawnVersion = -1
  private listeners = new Set<() => void>()
  private raf = 0
  private rateCount = 0
  private rateSince = performance.now()

  push(batch: MotorSample[]): void {
    for (const s of batch) {
      this.t.push(s.t / 1000)
      this.rpm.push(s.rpm)
      this.duty.push(s.duty)
      this.current.push(s.current)
    }
    // Trim in chunks so the O(n) splice is amortised.
    const excess = this.t.length - MAX_POINTS
    if (excess > MAX_POINTS / 4) {
      for (const arr of [this.t, this.rpm, this.duty, this.current]) arr.splice(0, excess)
    }
    if (batch.length) this.latest = batch[batch.length - 1]
    this.rateCount += batch.length
    const now = performance.now()
    if (now - this.rateSince >= 1000) {
      this.rate = (this.rateCount * 1000) / (now - this.rateSince)
      this.rateCount = 0
      this.rateSince = now
    }
    this.version++
  }

  clear(): void {
    for (const arr of [this.t, this.rpm, this.duty, this.current]) arr.length = 0
    this.latest = null
    this.rate = 0
    this.version++
  }

  series(field: MotorField): number[] {
    return this[field]
  }

  /** Call `cb` on each animation frame in which new data is available. Returns unsubscribe. */
  onFrame(cb: () => void): () => void {
    this.listeners.add(cb)
    cb()
    if (!this.raf) this.raf = requestAnimationFrame(this.loop)
    return () => {
      this.listeners.delete(cb)
      if (this.listeners.size === 0) {
        cancelAnimationFrame(this.raf)
        this.raf = 0
      }
    }
  }

  private loop = (): void => {
    if (this.version !== this.drawnVersion) {
      this.drawnVersion = this.version
      this.listeners.forEach((cb) => cb())
    }
    this.raf = requestAnimationFrame(this.loop)
  }
}

export const telemetry = new TelemetryStore()

// Single IPC subscription for the app's lifetime.
window.api.comms.onSamples((batch) => telemetry.push(batch))
