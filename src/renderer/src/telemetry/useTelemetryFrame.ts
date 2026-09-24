import { useEffect, useRef } from 'react'
import { telemetry } from './store'

/**
 * Run `draw` once per animation frame when new telemetry has arrived.
 * `draw` should update the DOM/canvas imperatively (refs), not set React state.
 */
export function useTelemetryFrame(draw: () => void): void {
  const ref = useRef(draw)
  ref.current = draw
  useEffect(() => telemetry.onFrame(() => ref.current()), [])
}
