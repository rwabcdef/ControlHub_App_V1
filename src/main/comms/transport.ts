import { LiftStatus, MotorSample, PingReport } from '@shared/types'

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
  /** Start the lift forward for `distance` edges; only on links that carry the LIFT0 socket */
  liftStart?(distance: number): Promise<void>
  /** SerLink PING the LIFT0 socket; only on links that carry it */
  liftPing?(): Promise<PingReport>
}
