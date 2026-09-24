import { create } from 'zustand'
import type { CommsState } from '@shared/types'
import { telemetry } from '../telemetry/store'

interface CommsStore {
  state: CommsState
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

/** Low-rate connection status (React state is fine here, unlike the telemetry stream). */
export const useComms = create<CommsStore>(() => ({
  state: { status: 'disconnected', kind: 'sim' },
  connect: () => window.api.comms.connect(),
  disconnect: () => window.api.comms.disconnect()
}))

const apply = (s: CommsState): void => {
  if (s.status === 'connecting') telemetry.clear()
  useComms.setState({ state: s })
}
window.api.comms.onState(apply)
void window.api.comms.getState().then(apply)
