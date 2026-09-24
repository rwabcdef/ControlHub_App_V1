import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface DisplaySettings {
  rpmMax: number
  currentMax: number
  /** Visible time window on strip charts, s */
  windowSec: number
  leftPanelOpen: boolean
  rightPanelOpen: boolean
}

interface DisplayStore extends DisplaySettings {
  set: (patch: Partial<DisplaySettings>) => void
}

export const DISPLAY_DEFAULTS: DisplaySettings = {
  rpmMax: 6000,
  currentMax: 5,
  windowSec: 10,
  leftPanelOpen: true,
  rightPanelOpen: true
}

/** UI preferences, persisted per machine in localStorage. */
export const useDisplay = create<DisplayStore>()(
  persist((set) => ({ ...DISPLAY_DEFAULTS, set: (patch) => set(patch) }), { name: 'display-settings' })
)
