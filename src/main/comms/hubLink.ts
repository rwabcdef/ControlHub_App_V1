import {
  CTRL_DUTY_MAX,
  CTRL_DUTY_MIN,
  CTRL_GAIN_MAX,
  CTRL_GAIN_SCALE,
  CTRL_RPM_MAX,
  CtrlDirection,
  CtrlReadback,
  CtrlSettings,
  HubClockReading,
  HubClockSetResult,
  HubSocket,
  HubState,
  LIFT_DISTANCE_MAX,
  LiftDirection,
  MOTOR_DUTY_MAX,
  MOTORS_FITTED,
  MotorDirection,
  MotorId,
  MotorReadback,
  PingReport
} from '@shared/types'
import { parseCtrlStatus, parseHubMode, parseLiftStatus, parseLine } from './parser'
import { Frame } from './serlink/Frame'
import { LineWriter, SendFrameResult, SerLink, Socket } from './serlink/SerLink'
import { TransportEvents } from './transport'

/** The hub's speed controller socket: status frames in, controller commands out. */
export const CTRL_PROTOCOL = 'CTRL0'
/**
 * The hub's direct motor socket: open loop duty and bridge direction, for
 * the Direct page. On both the hub's links (uart2 and MQTT).
 */
export const MOTOR_PROTOCOL = 'MOTOR'
/** The hub's lift socket - only on its MQTT link (SerLink2) */
export const LIFT_PROTOCOL = 'LIFT0'
/** The hub's real time clock socket - on both its links (uart2 and MQTT) */
export const RTC_PROTOCOL = 'RTC00'
/** The only lift on the remote hub */
const LIFT_ID = 'B'

export interface HubLinkOptions {
  /** Acquire the LIFT0 socket */
  lift?: boolean
}

/**
 * The ControlHubAA26 hub's SerLink sockets over one line-oriented link.
 * Shared by the serial and MQTT transports - the hub runs the same CTRL0
 * socket on uart2 (SerLink0) and on MQTT (SerLink2).
 */
export class HubLink {
  readonly serLink: SerLink
  readonly ctrl: Socket
  /** Sends only - the hub never sends MOTOR frames unasked */
  readonly motor: Socket
  readonly lift: Socket | null
  /** Sends only - the hub never sends RTC00 frames unasked */
  readonly rtc: Socket
  /** The hub's state as last reported, to spot a change of mode */
  private hub: HubState | null = null

  constructor(
    write: LineWriter,
    private readonly ev: TransportEvents,
    opts: HubLinkOptions = {}
  ) {
    const trace = ev.trace?.bind(ev)
    this.serLink = new SerLink(write, { debug: trace })
    this.ctrl = this.serLink.acquireSocket(CTRL_PROTOCOL, (frame) => {
      const s = parseCtrlStatus(frame.data)
      if (!s) return
      this.ev.sample(s.sample)
      this.onHubStatus(s.hub)
    })
    this.motor = this.serLink.acquireSocket(MOTOR_PROTOCOL)
    this.lift = opts.lift
      ? this.serLink.acquireSocket(LIFT_PROTOCOL, (frame) => {
          const s = parseLiftStatus(frame.data)
          if (s) this.ev.lift(s)
        })
      : null
    this.rtc = this.serLink.acquireSocket(RTC_PROTOCOL)
  }

  /** Handle one received line: a SerLink frame, or else plain JSON / CSV telemetry. */
  receiveLine(line: string): void {
    if (this.serLink.receiveLine(line)) return
    const s = parseLine(line)
    if (s) this.ev.sample(s)
  }

  /**
   * Send a command. A complete SerLink frame (e.g. CTRL0T516006BR0120, as
   * listed in the firmware's main_tasks.cpp) is sent as is; anything else is
   * sent as CTRL0 data (e.g. BR0120) in a 'T' frame. Rejects unless acked OK.
   * Resolves with any data piggybacked on the ack (e.g. BGR -> 0120).
   */
  async send(text: string): Promise<string | undefined> {
    const cmd = text.trim()
    if (!cmd) throw new Error('Empty command')
    const frame = Frame.fromString(cmd)
    const result = frame ? await this.serLink.sendFrame(frame) : await this.ctrl.sendData(cmd, true)
    return checkResult(frame ? frame.protocol : CTRL_PROTOCOL, result)
  }

  /**
   * Read controller B's settings and the hub's state:
   *   BGA -> 002000.0150.0148  gain, target RPM, measured RPM
   *   BGM -> 050               max duty
   *   BGD -> F                 selected direction
   *   BGO -> CP                mode and who started the run
   */
  async ctrlGet(): Promise<CtrlReadback> {
    const data = await this.sendCtrl('BGA')
    const m = /^(\d{6})\.(\d{4})\.(\d{4})$/.exec(data ?? '')
    if (!m) throw new Error(`${CTRL_PROTOCOL}: unexpected BGA reply "${data ?? ''}"`)
    const maxDuty = await this.sendCtrl('BGM')
    if (!/^\d{3}$/.test(maxDuty ?? '')) throw new Error(`${CTRL_PROTOCOL}: unexpected BGM reply "${maxDuty ?? ''}"`)
    const dir = await this.sendCtrl('BGD')
    if (dir !== 'F' && dir !== 'R') throw new Error(`${CTRL_PROTOCOL}: unexpected BGD reply "${dir ?? ''}"`)
    const mode = await this.sendCtrl('BGO')
    const hubMode = parseHubMode(mode ?? '')
    if (!hubMode) throw new Error(`${CTRL_PROTOCOL}: unexpected BGO reply "${mode ?? ''}"`)

    const hub: HubState = { ...hubMode, direction: dir === 'R' ? 'reverse' : 'forward' }
    // Only the status frame carries the run's target - keep it through the same run.
    if (this.hub?.mode === hub.mode && this.hub.runRpm !== undefined) hub.runRpm = this.hub.runRpm
    this.hub = hub
    this.ev.hub(hub)
    return {
      gainI: Number(m[1]) / CTRL_GAIN_SCALE,
      rpm: Number(m[2]),
      measuredRpm: Number(m[3]),
      maxDuty: Number(maxDuty),
      hub
    }
  }

  /**
   * Set controller B's integral gain, target RPM and / or max duty (BI002000,
   * BR0120, BM050). Each is read back (BGI, BGR, BGM) - the hub refuses BR
   * during a lift move, and a max duty out of its range - and the result is
   * what the hub now holds; rejects if a read back value differs from the
   * one sent. None of them starts anything.
   */
  async ctrlSet(s: Partial<CtrlSettings>): Promise<Partial<CtrlSettings>> {
    const out: Partial<CtrlSettings> = {}
    if (s.gainI !== undefined) {
      const micro = gainToMicro(s.gainI)
      await this.sendCtrl(`BI${String(micro).padStart(6, '0')}`)
      const back = await this.sendCtrl('BGI')
      if (!/^\d{6}$/.test(back ?? '')) throw new Error(`${CTRL_PROTOCOL}: unexpected BGI reply "${back ?? ''}"`)
      if (Number(back) !== micro) {
        throw new Error(`Gain read back as ${Number(back) / CTRL_GAIN_SCALE}, not ${micro / CTRL_GAIN_SCALE}`)
      }
      out.gainI = micro / CTRL_GAIN_SCALE
    }
    if (s.rpm !== undefined) {
      if (!Number.isInteger(s.rpm) || s.rpm < 0 || s.rpm > CTRL_RPM_MAX) {
        throw new Error(`RPM must be a whole number from 0 to ${CTRL_RPM_MAX}`)
      }
      await this.sendCtrl(`BR${String(s.rpm).padStart(4, '0')}`)
      // The hub refuses a new target during a lift move, so the read back is the check.
      const back = await this.sendCtrl('BGR')
      if (!/^\d{4}$/.test(back ?? '')) throw new Error(`${CTRL_PROTOCOL}: unexpected BGR reply "${back ?? ''}"`)
      if (Number(back) !== s.rpm) {
        throw new Error(`The hub kept ${Number(back)} RPM, not ${s.rpm} (refused during a lift move)`)
      }
      out.rpm = s.rpm
    }
    if (s.maxDuty !== undefined) {
      if (!Number.isInteger(s.maxDuty) || s.maxDuty < CTRL_DUTY_MIN || s.maxDuty > CTRL_DUTY_MAX) {
        throw new Error(`Max duty must be a whole number from ${CTRL_DUTY_MIN} to ${CTRL_DUTY_MAX}`)
      }
      await this.sendCtrl(`BM${String(s.maxDuty).padStart(3, '0')}`)
      // The hub ignores a value it won't take, so the read back is the check.
      const back = await this.sendCtrl('BGM')
      if (Number(back) !== s.maxDuty) {
        throw new Error(`Max duty read back as ${back ?? '?'}, not ${s.maxDuty}`)
      }
      out.maxDuty = s.maxDuty
    }
    return out
  }

  /**
   * Start a Control run at the target speed in the selected direction:
   * CTRL0T...BS. The hub ignores it unless idle - the status frames that
   * follow (or BGO) say whether it started.
   */
  async ctrlStart(): Promise<void> {
    await this.sendCtrl('BS')
  }

  /** Stop whatever is running - a Control run or a lift move: CTRL0T...BX. */
  async ctrlStop(): Promise<void> {
    await this.sendCtrl('BX')
  }

  /** Select the direction of the next Control run: CTRL0T...BDF / BDR. Ignored unless idle. */
  async ctrlSetDirection(direction: CtrlDirection): Promise<void> {
    // Checked here too, not just typed: it arrives from the renderer over IPC.
    if (direction !== 'forward' && direction !== 'reverse') {
      throw new Error(`Direction must be forward or reverse, not "${String(direction)}"`)
    }
    await this.sendCtrl(direction === 'forward' ? 'BDF' : 'BDR')
  }

  /**
   * Read a motor's duty and bridge direction:
   *   BGP -> 030   duty %, 3 digits
   *   BGD -> F     direction, F / R / D (disabled: both IN pins low)
   */
  async motorGet(id: MotorId): Promise<MotorReadback> {
    checkMotorId(id)
    const duty = await this.sendMotor(`${id}GP`)
    if (!/^\d{3}$/.test(duty ?? '')) throw new Error(`${MOTOR_PROTOCOL}: unexpected ${id}GP reply "${duty ?? ''}"`)
    const dir = await this.sendMotor(`${id}GD`)
    const direction = MOTOR_DIRECTION_FROM_CHAR[dir ?? '']
    if (!direction) throw new Error(`${MOTOR_PROTOCOL}: unexpected ${id}GD reply "${dir ?? ''}"`)
    return { duty: Number(duty), direction }
  }

  /**
   * Set a motor's duty, open loop: MOTOR BP030. The hub refuses it unless
   * idle (it lets go of the speed controller first), silently - so it is
   * read back (BGP), and rejects if the hub kept another value. Resolves
   * with the duty the hub now holds.
   */
  async motorSetDuty(id: MotorId, duty: number): Promise<number> {
    checkMotorId(id)
    if (!Number.isInteger(duty) || duty < 0 || duty > MOTOR_DUTY_MAX) {
      throw new Error(`Duty must be a whole number from 0 to ${MOTOR_DUTY_MAX}`)
    }
    await this.sendMotor(`${id}P${String(duty).padStart(3, '0')}`)
    const back = await this.sendMotor(`${id}GP`)
    if (!/^\d{3}$/.test(back ?? '')) throw new Error(`${MOTOR_PROTOCOL}: unexpected ${id}GP reply "${back ?? ''}"`)
    if (Number(back) !== duty) {
      throw new Error(`The hub kept ${Number(back)}%, not ${duty}% (refused unless idle)`)
    }
    return duty
  }

  /**
   * Set a motor's bridge direction: MOTOR BDF / BDR / BDD. Refused unless
   * idle, like the duty, so read back (BGD) the same way.
   */
  async motorSetDirection(id: MotorId, direction: MotorDirection): Promise<MotorDirection> {
    checkMotorId(id)
    // Checked here too, not just typed: it arrives from the renderer over IPC.
    const c = MOTOR_DIRECTION_TO_CHAR[direction]
    if (!c) throw new Error(`Direction must be forward, reverse or disabled, not "${String(direction)}"`)
    await this.sendMotor(`${id}D${c}`)
    const back = await this.sendMotor(`${id}GD`)
    const kept = MOTOR_DIRECTION_FROM_CHAR[back ?? '']
    if (!kept) throw new Error(`${MOTOR_PROTOCOL}: unexpected ${id}GD reply "${back ?? ''}"`)
    if (kept !== direction) throw new Error(`The hub kept ${kept}, not ${direction} (refused unless idle)`)
    return direction
  }

  /**
   * Start the lift for `distance` edges in `direction`, e.g.
   * LIFT0U645006BSF234 (forward) or LIFT0U645006BSR234 (reverse). Sent as
   * 'U', so this only confirms the frame was published; the hub reports the
   * move's end with an idle status frame. The speed is the controller's
   * (CTRL0 BR), not part of the start.
   */
  async liftStart(distance: number, direction: LiftDirection): Promise<void> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    if (!Number.isInteger(distance) || distance < 1 || distance > LIFT_DISTANCE_MAX) {
      throw new Error(`Lift distance must be a whole number from 1 to ${LIFT_DISTANCE_MAX}`)
    }
    // Checked here too, not just typed: it arrives from the renderer over IPC.
    if (direction !== 'forward' && direction !== 'reverse') {
      throw new Error(`Lift direction must be forward or reverse, not "${String(direction)}"`)
    }
    const dir = direction === 'forward' ? 'F' : 'R'
    checkResult(LIFT_PROTOCOL, await this.lift.sendData(`${LIFT_ID}S${dir}${distance}`, false))
  }

  /**
   * Lower the lift until its ground sensor (PB9) trips, giving up after
   * `maxEdges`: LIFT0U645006BG2000. Sent as 'U'; like a start, the hub
   * reports the move's end with an idle status frame.
   */
  async liftDown(maxEdges: number): Promise<void> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    if (!Number.isInteger(maxEdges) || maxEdges < 1 || maxEdges > LIFT_DISTANCE_MAX) {
      throw new Error(`Lift max edges must be a whole number from 1 to ${LIFT_DISTANCE_MAX}`)
    }
    checkResult(LIFT_PROTOCOL, await this.lift.sendData(`${LIFT_ID}G${maxEdges}`, false))
  }

  /** Stop the lift: LIFT0U645002BX, sent as 'U'. */
  async liftStop(): Promise<void> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    checkResult(LIFT_PROTOCOL, await this.lift.sendData(`${LIFT_ID}X`, false))
  }

  /**
   * Send raw data to a socket (e.g. CTRL0 BGA, LIFT0 BSF234) as a 'T' frame
   * (ack = true: rejects unless acked OK, resolves with any data on the ack)
   * or a 'U' frame.
   */
  async socketSend(protocol: HubSocket, data: string, ack: boolean): Promise<string | undefined> {
    const socket = protocol === CTRL_PROTOCOL ? this.ctrl : protocol === LIFT_PROTOCOL ? this.lift : undefined
    if (socket === undefined) throw new Error(`Unknown socket ${protocol}`)
    if (!socket) throw new Error(`${protocol} is only available over MQTT`)
    const payload = data.trim()
    if (!payload) throw new Error('Empty payload')
    return checkResult(protocol, await socket.sendData(payload, ack))
  }

  /**
   * Set the hub's clock to `date`, as this PC's local time, 24 hour:
   * RTC00T570015S20261023143005. Done on the ack, so the answer says
   * whether it was taken: S1 -> 'ok', S0 -> 'refused' (outside 2000..2099).
   * A plain ACK_OK -> 'noSocket' (firmware without a clock). Rejects with
   * no ack.
   */
  async rtcSet(date: Date): Promise<HubClockSetResult> {
    const data = checkResult(RTC_PROTOCOL, await this.rtc.sendData(`S${formatHubDateTime(date)}`, true))
    if (data === undefined) return 'noSocket'
    if (data === 'S1') return 'ok'
    if (data === 'S0') return 'refused'
    throw new Error(`${RTC_PROTOCOL}: unexpected S reply "${data}"`)
  }

  /**
   * Read the hub's clock: RTC00T571001G -> G120261023143007, i.e.
   * G<1|0><yyyymmddhhmmss> - 1 if set since power up, 0 if still counting
   * from 2000-01-01. Rejects on a plain ACK_OK (firmware without a clock).
   */
  async rtcGet(): Promise<HubClockReading> {
    const data = checkResult(RTC_PROTOCOL, await this.rtc.sendData('G', true))
    if (data === undefined) throw new Error(`The hub has no ${RTC_PROTOCOL} socket (firmware without a clock)`)
    const m = /^G([01])(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(data)
    if (!m) throw new Error(`${RTC_PROTOCOL}: unexpected G reply "${data}"`)
    return { isSet: m[1] === '1', dateTime: `${m[2]}-${m[3]}-${m[4]} ${m[5]}:${m[6]}:${m[7]}` }
  }

  /** SerLink PING the hub's LIFT0 socket (LIFT0S...PING). Never rejects once sent. */
  async liftPing(): Promise<PingReport> {
    if (!this.lift) throw new Error(`${LIFT_PROTOCOL} is only available over MQTT`)
    const { result, elapsedMs, error } = await this.lift.ping()
    return { result, elapsedMs, error: error?.message }
  }

  close(): void {
    this.serLink.close()
  }

  /**
   * A CTRL0 status frame's mode and direction. Passed on at once; when the
   * mode changes to a run, who started it is read with BGO and passed on
   * again. Idle has no source.
   */
  private onHubStatus(s: HubState): void {
    const changed = this.hub?.mode !== s.mode
    const source = s.mode === 'idle' ? 'none' : changed ? undefined : this.hub?.source
    this.hub = { ...s, source }
    this.ev.hub(this.hub)
    if (changed && s.mode !== 'idle') {
      this.sendCtrl('BGO')
        .then((data) => {
          const m = parseHubMode(data ?? '')
          if (m && this.hub && m.mode === this.hub.mode) {
            this.hub = { ...this.hub, source: m.source }
            this.ev.hub(this.hub)
          }
        })
        .catch(() => {
          // The next mode change tries again; the status frames carry on regardless.
        })
    }
  }

  /** Send MOTOR data in a 'T' frame; resolves with any data on the ack. */
  private async sendMotor(data: string): Promise<string | undefined> {
    return checkResult(MOTOR_PROTOCOL, await this.motor.sendData(data, true))
  }

  /** Send CTRL0 data in a 'T' frame; resolves with any data on the ack. */
  private async sendCtrl(data: string): Promise<string | undefined> {
    return checkResult(CTRL_PROTOCOL, await this.ctrl.sendData(data, true))
  }
}

const MOTOR_DIRECTION_FROM_CHAR: Record<string, MotorDirection | undefined> = {
  F: 'forward', R: 'reverse', D: 'disabled'
}
const MOTOR_DIRECTION_TO_CHAR: Record<string, string | undefined> = {
  forward: 'F', reverse: 'R', disabled: 'D'
}

/** Only a fitted channel - the hub sends A to motorB until motorA exists. Untrusted input from the renderer. */
function checkMotorId(id: MotorId): void {
  if (!MOTORS_FITTED.includes(id)) throw new Error(`Motor ${String(id)} is not fitted`)
}

/** Local time as RTC00's yyyymmddhhmmss, e.g. 20261023143005 */
function formatHubDateTime(d: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).padStart(4, '0')}${two(d.getMonth() + 1)}${two(d.getDate())}`
    + `${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
}

/** Gain as the hub's integer millionths; throws unless 0..CTRL_GAIN_MAX with at most 6 decimals. */
function gainToMicro(gain: number): number {
  const micro = Math.round(gain * CTRL_GAIN_SCALE)
  if (!Number.isFinite(gain) || micro < 0 || micro > CTRL_GAIN_MAX * CTRL_GAIN_SCALE
    || Math.abs(gain * CTRL_GAIN_SCALE - micro) > 1e-6) {
    throw new Error(`Gain must be 0 to ${CTRL_GAIN_MAX}, with at most 6 decimal places`)
  }
  return micro
}

function checkResult(protocol: string, r: SendFrameResult): string | undefined {
  switch (r.status) {
    case 'ok':
      return r.ackData
    case 'nack':
      throw new Error(`${protocol}: command rejected (ack code ${r.ack?.dataLen})`)
    case 'timeout':
      throw new Error(`${protocol}: no ack from the hub`)
    case 'closed':
      throw new Error('Link closed')
    case 'error':
      throw r.error ?? new Error(`${protocol}: send failed`)
  }
}
