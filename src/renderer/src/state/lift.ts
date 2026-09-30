import { create } from 'zustand'
import type { LiftDirection, LiftStatus, PingReport } from '@shared/types'
import { errorMessage } from '../util'

/** LIFT0 ping: idle until the first ping, pinging while one is out, else its last outcome */
export type LiftPingState = { phase: 'idle' } | { phase: 'pinging' } | ({ phase: 'done' } & PingReport)

interface LiftStore {
  /** Last status reported by the hub's LIFT0 socket */
  status: LiftStatus | null
  /** Set when the hub reports the lift idle (move ended); cleared by the next start */
  done: boolean
  ping: LiftPingState
  start: (distance: number, direction: LiftDirection) => Promise<void>
  /** Lower the lift to its ground sensor, `maxEdges` at most */
  down: (maxEdges: number) => Promise<void>
  stop: () => Promise<void>
  /** SerLink PING the hub's LIFT0 socket; ignored while one is in progress */
  sendPing: () => Promise<void>
}

export const useLift = create<LiftStore>((set, get) => ({
  status: null,
  done: false,
  ping: { phase: 'idle' },
  start: async (distance, direction) => {
    set({ done: false })
    await window.api.lift.start(distance, direction)
  },
  down: async (maxEdges) => {
    set({ done: false })
    await window.api.lift.down(maxEdges)
  },
  stop: () => window.api.lift.stop(),
  sendPing: async () => {
    if (get().ping.phase === 'pinging') return
    set({ ping: { phase: 'pinging' } })
    const report: PingReport = await window.api.lift
      .ping()
      .catch((e) => ({ result: 'error', elapsedMs: 0, error: errorMessage(e) }))
    set({ ping: { phase: 'done', ...report } })
  }
}))

window.api.lift.onStatus((s) => useLift.setState({ status: s, done: !s.moving }))
// A new connection starts with no ping result.
window.api.comms.onState((s) => s.status === 'connecting' && useLift.setState({ ping: { phase: 'idle' } }))
