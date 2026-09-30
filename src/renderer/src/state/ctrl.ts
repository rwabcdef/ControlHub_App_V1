import { create } from 'zustand'
import type { CommsState, CtrlSettings } from '@shared/types'
import { errorMessage } from '../util'

export type CtrlMode = 'integral' | 'proportional' | 'integralProportional'

interface CtrlStore {
  mode: CtrlMode
  /** What the hub holds, as last read (BGA) or saved; null until known */
  gainI: number | null
  rpm: number | null
  loading: boolean
  /** Why the last read failed, if it did */
  loadError: string | null
  setMode: (mode: CtrlMode) => void
  /** Read the hub's values with BGA */
  load: () => Promise<void>
  /** Send the changed values; rejects if the hub doesn't take them */
  save: (s: Partial<CtrlSettings>) => Promise<void>
}

/** Speed controller B's settings, from / to the hub's CTRL0 socket. */
export const useCtrl = create<CtrlStore>((set) => ({
  mode: 'integral',
  gainI: null,
  rpm: null,
  loading: false,
  loadError: null,
  setMode: (mode) => set({ mode }),
  load: async () => {
    set({ loading: true, loadError: null })
    try {
      const r = await window.api.ctrl.get()
      set({ gainI: r.gainI, rpm: r.rpm })
    } catch (e) {
      set({ loadError: errorMessage(e) })
    } finally {
      set({ loading: false })
    }
  },
  save: async (s) => {
    const saved = await window.api.ctrl.set(s)
    set((cur) => ({ gainI: saved.gainI ?? cur.gainI, rpm: saved.rpm ?? cur.rpm }))
  }
}))

// Read the hub's values on each (re)connection to it; forget them when disconnected.
const apply = (s: CommsState): void => {
  if (s.status === 'connected' && s.kind !== 'sim') void useCtrl.getState().load()
  else if (s.status === 'connecting' || s.status === 'disconnected') {
    useCtrl.setState({ gainI: null, rpm: null, loadError: null })
  }
}
window.api.comms.onState(apply)
void window.api.comms.getState().then(apply)
