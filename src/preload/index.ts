import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  CommsConfig,
  CommsState,
  DirEntry,
  MotorSample,
  SerialPortInfo
} from '../shared/types'
import { IPC } from '../shared/types'

/** Subscribe to a main->renderer channel; returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// The complete, typed surface the renderer can use. Nothing else from Node/Electron is exposed.
const api = {
  platform: process.platform,

  comms: {
    listPorts: (): Promise<SerialPortInfo[]> => ipcRenderer.invoke(IPC.commsListPorts),
    getConfig: (): Promise<CommsConfig> => ipcRenderer.invoke(IPC.commsGetConfig),
    setConfig: (cfg: CommsConfig): Promise<CommsConfig> => ipcRenderer.invoke(IPC.commsSetConfig, cfg),
    getState: (): Promise<CommsState> => ipcRenderer.invoke(IPC.commsGetState),
    /** Connect using `cfg`, or the saved config if omitted */
    connect: (cfg?: CommsConfig): Promise<void> => ipcRenderer.invoke(IPC.commsConnect, cfg),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.commsDisconnect),
    send: (text: string): Promise<void> => ipcRenderer.invoke(IPC.commsSend, text),
    onSamples: (cb: (batch: MotorSample[]) => void) => on(IPC.commsSamples, cb),
    onState: (cb: (state: CommsState) => void) => on(IPC.commsState, cb)
  },

  fs: {
    listRoots: (): Promise<string[]> => ipcRenderer.invoke(IPC.fsListRoots),
    /** Opens a native folder picker; returns the updated list of granted roots */
    addRoot: (): Promise<string[]> => ipcRenderer.invoke(IPC.fsAddRoot),
    removeRoot: (root: string): Promise<string[]> => ipcRenderer.invoke(IPC.fsRemoveRoot, root),
    readDir: (root: string, rel = ''): Promise<DirEntry[]> => ipcRenderer.invoke(IPC.fsReadDir, root, rel),
    readText: (root: string, rel: string): Promise<string> => ipcRenderer.invoke(IPC.fsReadText, root, rel),
    writeText: (root: string, rel: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC.fsWriteText, root, rel, content)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
