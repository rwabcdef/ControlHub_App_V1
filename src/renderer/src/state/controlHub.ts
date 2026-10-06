import { create } from 'zustand'
import { DEFAULT_CONTROL_HUB_SETTINGS, type ControlHubSettings } from '@shared/types'

interface ControlHubStore extends ControlHubSettings {
  /** Persist in the main process (settings.json); rejects if it refuses the value */
  save: (s: Partial<ControlHubSettings>) => Promise<void>
}

/**
 * Config -> ControlHub settings that the app keeps (the hub keeps gain, max
 * duty and target speed - see state/ctrl.ts). Loaded once at startup.
 */
export const useControlHub = create<ControlHubStore>((set) => ({
  ...DEFAULT_CONTROL_HUB_SETTINGS,
  save: async (s) => set(await window.api.settings.setControlHub(s))
}))

void window.api.settings.getControlHub().then((s) => useControlHub.setState(s))
