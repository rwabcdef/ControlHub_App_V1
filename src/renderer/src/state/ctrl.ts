import { create } from 'zustand'
import type { CommsState, CtrlDirection, CtrlSettings } from '@shared/types'
import { errorMessage } from '../util'
import { useHub } from './hub'

export type CtrlMode = 'integral' | 'proportional' | 'integralProportional'

interface CtrlStore {
  mode: CtrlMode
  /** What the hub holds, as last read (BGA, BGM) or saved; null until known */
  gainI: number | null
  /** The hub's target speed: the next run's, and a PC Control run's in progress */
  rpm: number | null
  /**
   * Why the last setRpmLive() failed, if it did; cleared by the next one that
   * succeeds. A new object for each failure, so a repeat of the same message
   * still shows as a new failure.
   */
  rpmError: { message: string } | null
  maxDuty: number | null
  loading: boolean
  /** Why the last read failed, if it did */
  loadError: string | null
  setMode: (mode: CtrlMode) => void
  /** Read the hub's values (BGA, BGM, BGD, BGO) - and its state, into useHub */
  load: () => Promise<void>
  /** Send the changed values; rejects if the hub doesn't take them */
  save: (s: Partial<CtrlSettings>) => Promise<void>
  /**
   * The dashboard dial: set the target speed as it turns. Never rejects - a
   * failure lands in rpmError. One set is in flight at a time; values given
   * meanwhile replace each other, and only the latest is sent next.
   */
  setRpmLive: (rpm: number) => void
  /** Start a Control run (BS) - ignored by the hub unless idle */
  start: () => Promise<void>
  /** Stop whatever runs - a Control run or a lift move (BX) */
  stop: () => Promise<void>
  /** Select the direction (BD) - ignored by the hub unless idle */
  setDirection: (direction: CtrlDirection) => Promise<void>
}

// setRpmLive()'s coalescing: the value still to send, and whether a send is running.
let pendingRpm: number | null = null
let rpmInFlight = false

/** Speed controller B's settings, and Control runs, through the hub's CTRL0 socket. */
export const useCtrl = create<CtrlStore>((set, get) => ({
  mode: 'integral',
  gainI: null,
  rpm: null,
  rpmError: null,
  maxDuty: null,
  loading: false,
  loadError: null,
  setMode: (mode) => set({ mode }),
  load: async () => {
    set({ loading: true, loadError: null })
    try {
      const r = await window.api.ctrl.get()
      set({ gainI: r.gainI, rpm: r.rpm, maxDuty: r.maxDuty })
      useHub.setState({ hub: r.hub })
    } catch (e) {
      set({ loadError: errorMessage(e) })
    } finally {
      set({ loading: false })
    }
  },
  save: async (s) => {
    const saved = await window.api.ctrl.set(s)
    // A set that finishes after a disconnect must not bring back values
    // apply() has forgotten.
    if (get().rpm === null && get().gainI === null && get().maxDuty === null) return
    set((cur) => ({
      gainI: saved.gainI ?? cur.gainI,
      rpm: saved.rpm ?? cur.rpm,
      maxDuty: saved.maxDuty ?? cur.maxDuty
    }))
  },
  setRpmLive: (rpm) => {
    pendingRpm = rpm
    if (rpmInFlight) return
    rpmInFlight = true
    void (async () => {
      while (pendingRpm !== null) {
        const next = pendingRpm
        pendingRpm = null
        try {
          await get().save({ rpm: next })
          set({ rpmError: null })
        } catch (e) {
          // Dropped if the link went in the meantime - a reconnect starts clean.
          if (pendingRpm === null && get().rpm !== null) set({ rpmError: { message: errorMessage(e) } })
        }
      }
      rpmInFlight = false
    })()
  },
  start: () => window.api.ctrl.start(),
  stop: () => window.api.ctrl.stop(),
  setDirection: async (direction) => {
    await window.api.ctrl.setDirection(direction)
    // The hub only says so in its next status frame, which only comes while
    // running - read it back now, so the selection shows straight away.
    await get().load()
  }
}))

// Read the hub's values on each (re)connection to it; forget them when disconnected.
const apply = (s: CommsState): void => {
  if (s.status === 'connected' && s.kind !== 'sim') {
    useCtrl.setState({ rpmError: null })
    void useCtrl.getState().load()
  } else if (s.status === 'connecting' || s.status === 'disconnected' || s.status === 'error') {
    pendingRpm = null
    useCtrl.setState({ gainI: null, rpm: null, rpmError: null, maxDuty: null, loadError: null })
  }
}
window.api.comms.onState(apply)
void window.api.comms.getState().then(apply)
