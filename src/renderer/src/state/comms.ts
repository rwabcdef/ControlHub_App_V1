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
  state: { status: 'disconnected', kind: 'mqtt' },
  connect: () => window.api.comms.connect(),
  disconnect: () => window.api.comms.disconnect()
}))

const apply = (s: CommsState): void => {
  if (s.status === 'connecting') telemetry.clear()
  useComms.setState({ state: s })
}
window.api.comms.onState(apply)
void window.api.comms.getState().then(apply)

// SerLink traffic from the main process, to the DevTools console.
const TRACE_STYLE = { tx: 'color:#4caf50', rx: 'color:#29b6f6' } as const
window.api.comms.onTrace((line) => {
  const dir = / (tx|rx) /.exec(line)?.[1] as keyof typeof TRACE_STYLE | undefined
  console.log(`%c[SerLink] ${line}`, dir ? TRACE_STYLE[dir] : 'color:#ffb74d')
})
