import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  CommsConfig,
  CommsState,
  ControlHubSettings,
  CtrlDirection,
  CtrlReadback,
  CtrlSettings,
  DirEntry,
  HubSocket,
  HubState,
  LiftDirection,
  LiftStatus,
  MotorSample,
  MqttLogLine,
  PingReport,
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
    /** Resolves with any reply data, e.g. piggybacked on a SerLink ack */
    send: (text: string): Promise<string | undefined> => ipcRenderer.invoke(IPC.commsSend, text),
    onSamples: (cb: (batch: MotorSample[]) => void) => on(IPC.commsSamples, cb),
    onState: (cb: (state: CommsState) => void) => on(IPC.commsState, cb),
    /** SerLink trace lines (dev / SERLINK_DEBUG only) */
    onTrace: (cb: (line: string) => void) => on(IPC.serlinkTrace, cb),
    /** Send raw data to a hub socket (e.g. CTRL0 BGA, LIFT0 BSF234) as a 'T' (ack) or 'U' frame; resolves with any ack data */
    socketSend: (protocol: HubSocket, data: string, ack: boolean): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC.socketSend, protocol, data, ack)
  },

  ctrl: {
    /** Read speed controller B's gain, target / measured RPM and max duty, and the hub's state (BGA, BGM, BGD, BGO) */
    get: (): Promise<CtrlReadback> => ipcRenderer.invoke(IPC.ctrlGet),
    /** Set the gain, target RPM and / or max duty; resolves with what the hub now holds. Starts nothing. */
    set: (s: Partial<CtrlSettings>): Promise<Partial<CtrlSettings>> => ipcRenderer.invoke(IPC.ctrlSet, s),
    /** Start a Control run (BS) - the hub ignores it unless idle */
    start: (): Promise<void> => ipcRenderer.invoke(IPC.ctrlStart),
    /** Stop whatever runs - a Control run or a lift move (BX) */
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.ctrlStop),
    /** Select the direction (BDF / BDR) - the hub ignores it unless idle */
    setDirection: (direction: CtrlDirection): Promise<void> => ipcRenderer.invoke(IPC.ctrlSetDirection, direction)
  },

  hub: {
    /** The hub's mode and direction, from each CTRL0 status frame */
    onState: (cb: (state: HubState) => void) => on(IPC.hubState, cb)
  },

  log: {
    /** Batches of MQTT traffic lines, both directions (MQTT connection only) */
    onMqtt: (cb: (lines: MqttLogLine[]) => void) => on(IPC.mqttLog, cb)
  },

  settings: {
    /** Config -> ControlHub settings kept by the app */
    getControlHub: (): Promise<ControlHubSettings> => ipcRenderer.invoke(IPC.controlHubGet),
    setControlHub: (s: Partial<ControlHubSettings>): Promise<ControlHubSettings> =>
      ipcRenderer.invoke(IPC.controlHubSet, s)
  },

  lift: {
    /** Start the lift for `distance` edges in `direction` (MQTT only) */
    start: (distance: number, direction: LiftDirection): Promise<void> =>
      ipcRenderer.invoke(IPC.liftStart, distance, direction),
    /** Lower the lift to the ground sensor, `maxEdges` at most (MQTT only) */
    down: (maxEdges: number): Promise<void> => ipcRenderer.invoke(IPC.liftDown, maxEdges),
    /** Stop the lift (MQTT only) */
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.liftStop),
    /** SerLink PING the hub's LIFT0 socket (MQTT only) */
    ping: (): Promise<PingReport> => ipcRenderer.invoke(IPC.liftPing),
    onStatus: (cb: (status: LiftStatus) => void) => on(IPC.liftStatus, cb)
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
