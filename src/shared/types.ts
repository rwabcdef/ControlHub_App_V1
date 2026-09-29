// Types and IPC channel names shared by main, preload and renderer.

/** One telemetry sample. `t` is milliseconds since the connection started. */
export interface MotorSample {
  t: number
  /** Shaft speed, RPM */
  rpm: number
  /** PWM duty cycle, 0-100 % */
  duty: number
  /** Motor current, A (NaN if the source doesn't report it) */
  current: number
}

/** A lift's state, from the hub's LIFT0 socket, e.g. BI000234.000234 */
export interface LiftStatus {
  /** Lift id, e.g. 'B' */
  lift: string
  moving: boolean
  /** Edges travelled since the last start */
  travelled: number
  /** That start's target, edges */
  target: number
}

/** Lift start distance range, edges (the hub takes 1..6 digits) */
export const LIFT_DISTANCE_MAX = 999_999

export type MotorField = Exclude<keyof MotorSample, 't'>

export type CommsKind = 'sim' | 'serial' | 'mqtt'

export interface SerialConfig {
  path: string
  baudRate: number
}

export interface MqttConfig {
  url: string
  /** Topic the device publishes SerLink frames (telemetry, acks) on */
  telemetryTopic: string
  /** Topic the app publishes SerLink frames (commands, acks) on */
  commandTopic: string
  username?: string
  password?: string
}

export interface CommsConfig {
  kind: CommsKind
  serial: SerialConfig
  mqtt: MqttConfig
}

export type CommsStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface CommsState {
  status: CommsStatus
  kind: CommsKind
  error?: string
}

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

export interface DirEntry {
  name: string
  isDir: boolean
  size: number
  mtimeMs: number
}

export const DEFAULT_COMMS_CONFIG: CommsConfig = {
  kind: 'mqtt',
  serial: { path: '', baudRate: 115200 },
  mqtt: {
    // ControlHubAA26 hub: MQTT_BROKER_IP / MQTT2_TOPIC_UP / MQTT2_TOPIC_DOWN in main_tasks.cpp
    url: 'mqtt://192.168.0.196:1883',
    telemetryTopic: 'hub/aa26/serlink/up',
    commandTopic: 'hub/aa26/serlink/down'
  }
}

export const IPC = {
  commsListPorts: 'comms:listPorts',
  commsGetConfig: 'comms:getConfig',
  commsSetConfig: 'comms:setConfig',
  commsConnect: 'comms:connect',
  commsDisconnect: 'comms:disconnect',
  commsSend: 'comms:send',
  commsGetState: 'comms:getState',
  /** main -> renderer: MotorSample[] batch */
  commsSamples: 'comms:samples',
  /** main -> renderer: CommsState */
  commsState: 'comms:state',
  liftStart: 'lift:start',
  /** main -> renderer: LiftStatus */
  liftStatus: 'lift:status',
  /** main -> renderer: one SerLink trace line (dev / SERLINK_DEBUG only) */
  serlinkTrace: 'serlink:trace',

  fsListRoots: 'fs:listRoots',
  fsAddRoot: 'fs:addRoot',
  fsRemoveRoot: 'fs:removeRoot',
  fsReadDir: 'fs:readDir',
  fsReadText: 'fs:readText',
  fsWriteText: 'fs:writeText'
} as const
