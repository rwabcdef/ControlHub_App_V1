import { CtrlReadback, CtrlSettings, HubSocket, LiftDirection, LiftStatus, MotorSample, PingReport } from '@shared/types'

/** A sample as decoded from the wire; `t` is optional (host time is used if absent). */
export type RawSample = Omit<MotorSample, 't'> & { t?: number }

export interface TransportEvents {
  sample(s: RawSample): void
  /** Lift status / done report */
  lift(s: LiftStatus): void
  /** SerLink trace line (frames sent / received, ack timeouts, ...); unset = tracing off */
  trace?(msg: string): void
  /** Non-fatal or fatal link problem; the transport may recover (see `reconnected`) */
  error(err: Error): void
  /** Link restored after an error (e.g. MQTT auto-reconnect) */
  reconnected(): void
  /** Link closed by the remote end / device unplugged */
  close(): void
}

/** Common interface for serial, MQTT and the simulator. */
export interface Transport {
  open(): Promise<void>
  close(): Promise<void>
  /** Send one text command line to the device; resolves with any reply data (e.g. from a SerLink ack) */
  send(text: string): Promise<string | undefined>
  /** Send raw data to a hub socket as a 'T' (ack) or 'U' frame; resolves with any ack data */
  socketSend?(protocol: HubSocket, data: string, ack: boolean): Promise<string | undefined>
  /** Read / set the hub's speed controller B over CTRL0; only on links to the hub */
  ctrlGet?(): Promise<CtrlReadback>
  ctrlSet?(s: Partial<CtrlSettings>): Promise<Partial<CtrlSettings>>
  /** Start the lift for `distance` edges in `direction`; only on links that carry the LIFT0 socket */
  liftStart?(distance: number, direction: LiftDirection): Promise<void>
  /** Lower the lift to its ground sensor, `maxEdges` at most; only on links that carry the LIFT0 socket */
  liftDown?(maxEdges: number): Promise<void>
  /** Stop the lift; only on links that carry the LIFT0 socket */
  liftStop?(): Promise<void>
  /** SerLink PING the LIFT0 socket; only on links that carry it */
  liftPing?(): Promise<PingReport>
}
