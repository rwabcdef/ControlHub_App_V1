import { MotorSample } from '@shared/types'

/** A sample as decoded from the wire; `t` is optional (host time is used if absent). */
export type RawSample = Omit<MotorSample, 't'> & { t?: number }

export interface TransportEvents {
  sample(s: RawSample): void
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
  /** Send one text command line to the device */
  send(text: string): Promise<void>
}
