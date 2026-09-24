import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CommsConfig, DEFAULT_COMMS_CONFIG } from '@shared/types'

// Persisted app settings owned by the main process (userData/settings.json).
// UI-only preferences live in the renderer (localStorage) instead.
export interface Settings {
  comms: CommsConfig
  /** Directories the user has granted file access to */
  allowedDirs: string[]
}

let cache: Settings | null = null

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (cache) return cache
  let stored: Partial<Settings> = {}
  try {
    stored = JSON.parse(readFileSync(settingsFile(), 'utf-8'))
  } catch {
    // first run or unreadable file: fall back to defaults
  }
  cache = {
    comms: {
      ...DEFAULT_COMMS_CONFIG,
      ...stored.comms,
      serial: { ...DEFAULT_COMMS_CONFIG.serial, ...stored.comms?.serial },
      mqtt: { ...DEFAULT_COMMS_CONFIG.mqtt, ...stored.comms?.mqtt }
    },
    allowedDirs: stored.allowedDirs ?? []
  }
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch }
  writeFileSync(settingsFile(), JSON.stringify(cache, null, 2))
  return cache
}
