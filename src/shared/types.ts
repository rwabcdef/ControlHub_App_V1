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

/** Which way a lift start moves - the F / R in LIFT0 BSF234 / BSR234 */
export type LiftDirection = 'forward' | 'reverse'

/** Speed controller B's settings, from the hub's CTRL0 socket */
export interface CtrlSettings {
  /** Integral gain, 0..CTRL_GAIN_MAX in steps of 1e-6 (BI002000 = 0.002) */
  gainI: number
  /**
   * Target speed, RPM, 0..CTRL_RPM_MAX (BR0120 = 120). Does not start
   * anything: it is the speed of the next Control run or lift move, and live
   * in a Control run in progress (bar a run started from the remote hub,
   * whose pot sets its speed). The hub refuses it during a lift move.
   */
  rpm: number
  /** Max duty cycle, %, CTRL_DUTY_MIN..CTRL_DUTY_MAX (BM050 = 50) */
  maxDuty: number
}

/** BGA's answer, e.g. 002000.0150.0148, plus BGM, BGD and BGO */
export interface CtrlReadback extends CtrlSettings {
  /** Measured speed, RPM; the hub clamps it at 9999, so 9999 may be a faulty tacho */
  measuredRpm: number
  /** The hub's mode, selected direction and who started the run */
  hub: HubState
}

/** The hub takes the gain as 6 digits of millionths, RPM as 4 digits and max duty as 3 */
export const CTRL_GAIN_SCALE = 1_000_000
export const CTRL_GAIN_MAX = 0.999999
export const CTRL_RPM_MAX = 9999
/** The hub refuses a max duty below CONTROLB_TACHO_CHECK_MIN_PERCENT (20) */
export const CTRL_DUTY_MIN = 20
export const CTRL_DUTY_MAX = 100

/**
 * The hub's mode (HubApp in the firmware): idle, a Control run (the motor
 * held at the target speed until stopped) or a lift move.
 */
export type HubMode = 'idle' | 'control' | 'lift'
/** Who started the run in progress - the PC (this app, or the serial console) or the remote hub */
export type HubSource = 'pc' | 'remote' | 'none'
/** A Control run's direction - the F / R in CTRL0 BDF / BDR */
export type CtrlDirection = 'forward' | 'reverse'

/** From the hub's CTRL0 status frame (mode, direction) and BGO (source) */
export interface HubState {
  mode: HubMode
  /** The run's direction while running, the selected one while idle */
  direction: CtrlDirection
  /** Unknown (undefined) until read with BGO */
  source?: HubSource
}

/** The hub's SerLink sockets the app can send raw data to */
export type HubSocket = 'CTRL0' | 'LIFT0'

/** A SerLink 'S' PING's outcome - as SerLink's PingResult */
export type PingResult = 'ok' | 'noSocket' | 'timeout' | 'unexpected' | 'error' | 'closed'

export interface PingReport {
  result: PingResult
  /** Milliseconds from queuing the ping to its answer (or timeout) */
  elapsedMs: number
  /** Set for 'error' */
  error?: string
}

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

/** The Control Hub settings kept by this app, not the hub (userData/settings.json) */
export interface ControlHubSettings {
  /** Lift move distance, edges (1..LIFT_DISTANCE_MAX) */
  liftDistance: number
  /** Top of the dashboard's speed dial, RPM (1..CTRL_RPM_MAX) */
  dialRpmMax: number
}

export const DEFAULT_CONTROL_HUB_SETTINGS: ControlHubSettings = {
  liftDistance: 100,
  dialRpmMax: 300
}

/** One line of MQTT traffic, for the MQTT log page */
export interface MqttLogLine {
  /** Wall clock, ms since the epoch */
  t: number
  /** in: from the hub (telemetry topic); out: to the hub (command topic) */
  dir: 'in' | 'out'
  topic: string
  line: string
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
  ctrlGet: 'ctrl:get',
  ctrlSet: 'ctrl:set',
  /** Start a Control run (CTRL0 BS) */
  ctrlStart: 'ctrl:start',
  /** Stop whatever is running (CTRL0 BX) */
  ctrlStop: 'ctrl:stop',
  /** Select the direction (CTRL0 BD) - the hub takes it only while idle */
  ctrlSetDirection: 'ctrl:setDirection',
  /** main -> renderer: HubState, from each CTRL0 status frame */
  hubState: 'hub:state',
  /** main -> renderer: MqttLogLine[] batch */
  mqttLog: 'log:mqtt',
  controlHubGet: 'settings:getControlHub',
  controlHubSet: 'settings:setControlHub',
  liftStart: 'lift:start',
  liftDown: 'lift:down',
  liftStop: 'lift:stop',
  liftPing: 'lift:ping',
  /** main -> renderer: LiftStatus */
  liftStatus: 'lift:status',
  /** Raw data to a hub socket (Dev page) */
  socketSend: 'serlink:socketSend',
  /** main -> renderer: one SerLink trace line (dev / SERLINK_DEBUG only) */
  serlinkTrace: 'serlink:trace',

  fsListRoots: 'fs:listRoots',
  fsAddRoot: 'fs:addRoot',
  fsRemoveRoot: 'fs:removeRoot',
  fsReadDir: 'fs:readDir',
  fsReadText: 'fs:readText',
  fsWriteText: 'fs:writeText'
} as const
