import { useSyncExternalStore } from 'react'
import type { MqttLogLine } from '@shared/types'

/** Lines kept; the oldest go first. */
const MAX_LINES = 5_000
/** The page re-renders at most this often, however fast lines arrive. */
const NOTIFY_MS = 200

/**
 * MQTT traffic log, both directions, kept OUTSIDE React state like the
 * telemetry buffer: lines arrive in batches from the main process (every
 * 16 ms while busy), and pushing each batch through React state would
 * re-render the page at that rate. Subscribers are told at most every
 * NOTIFY_MS instead, and read a snapshot.
 *
 * Collected from app start, whichever page is showing, so the log page
 * shows what happened before it was opened.
 */
class MqttLogStore {
  private lines: MqttLogLine[] = []
  private snapshot: MqttLogLine[] = []
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  /** While paused, lines are still collected but the snapshot is frozen. */
  private paused = false

  push(batch: MqttLogLine[]): void {
    this.lines.push(...batch)
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES)
    this.schedule()
  }

  clear(): void {
    this.lines = []
    this.snapshot = []
    this.emit()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (!paused) this.schedule()
  }

  readonly subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  readonly getSnapshot = (): MqttLogLine[] => this.snapshot

  private schedule(): void {
    if (this.paused || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.paused) {
        this.snapshot = this.lines.slice()
        this.emit()
      }
    }, NOTIFY_MS)
  }

  private emit(): void {
    for (const cb of this.listeners) cb()
  }
}

export const mqttLog = new MqttLogStore()

window.api.log.onMqtt((batch) => mqttLog.push(batch))

/** The log's lines, re-rendering at most every NOTIFY_MS. */
export function useMqttLog(): MqttLogLine[] {
  return useSyncExternalStore(mqttLog.subscribe, mqttLog.getSnapshot)
}
