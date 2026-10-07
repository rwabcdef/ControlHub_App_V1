import { create } from 'zustand'
import type { CommsState, HubState } from '@shared/types'

interface HubStore {
  /** The hub's mode, direction and run source; null until known (read on connecting, then each status frame) */
  hub: HubState | null
}

/**
 * The hub's state (HubApp in the firmware): idle, a Control run or a lift
 * move. Low rate - a status frame every 250 ms while running - so React
 * state is fine here.
 */
export const useHub = create<HubStore>(() => ({ hub: null }))

window.api.hub.onState((hub) => useHub.setState({ hub }))
// Forget it when the link goes; state/ctrl.ts reads it again on connecting.
const apply = (s: CommsState): void => {
  if (s.status !== 'connected') useHub.setState({ hub: null })
}
window.api.comms.onState(apply)
