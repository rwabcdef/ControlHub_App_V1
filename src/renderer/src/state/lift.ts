import { create } from 'zustand'
import type { LiftStatus } from '@shared/types'

interface LiftStore {
  /** Last status reported by the hub's LIFT0 socket */
  status: LiftStatus | null
  /** Set when the hub reports the lift idle (move ended); cleared by the next start */
  done: boolean
  start: (distance: number) => Promise<void>
}

export const useLift = create<LiftStore>((set) => ({
  status: null,
  done: false,
  start: async (distance) => {
    set({ done: false })
    await window.api.lift.start(distance)
  }
}))

window.api.lift.onStatus((s) => useLift.setState({ status: s, done: !s.moving }))
