import { create } from 'zustand'
import { MOTORS_FITTED, type CommsState, type MotorDirection, type MotorId } from '@shared/types'
import { errorMessage } from '../util'
import { useHub } from './hub'

export interface DirectMotor {
  /** What the hub holds, as last read (GP) or set; null until known */
  duty: number | null
  /**
   * The duty last asked for - the dial's latest value (or Stop's 0), ahead of
   * the hub while a set is on its way; the hub's duty again after a read. Null until known.
   */
  requested: number | null
  /** The bridge direction, as last read (GD) or set; null until known */
  direction: MotorDirection | null
  /**
   * Why the last setDutyLive() failed, if it did; cleared by the next one
   * that succeeds. A new object for each failure, as useCtrl's rpmError.
   */
  dutyError: { message: string } | null
  /**
   * A new object on each Stop. Passed to the dial as its error (with dutyError),
   * so it drops a value of its own that was never sent and shows the hub's.
   */
  dialReset: object | null
  /** Why the last read or direction set failed, if it did */
  error: string | null
}

interface DirectStore {
  motors: Record<MotorId, DirectMotor>
  /** Read a fitted motor's duty and direction (MOTOR GP, GD) */
  load: (id: MotorId) => Promise<void>
  /**
   * The Direct page's dial: set the duty as it turns. Never rejects - a
   * failure lands in dutyError. As useCtrl.setRpmLive(), one set per motor is
   * in flight at a time, and only the latest value given meanwhile is sent next.
   */
  setDutyLive: (id: MotorId, duty: number) => void
  /**
   * The Stop button: 0% straight away. Dial values not yet sent are dropped, so
   * at most the one set already in flight goes out before it.
   */
  stop: (id: MotorId) => void
  /** Set the bridge direction (MOTOR D); a failure lands in error */
  setDirection: (id: MotorId, direction: MotorDirection) => Promise<void>
}

const UNKNOWN: DirectMotor = {
  duty: null, requested: null, direction: null, dutyError: null, dialReset: null, error: null
}

// setDutyLive()'s coalescing, per motor: the value still to send, and whether a send is running.
const pendingDuty: Partial<Record<MotorId, number>> = {}
const dutyInFlight: Partial<Record<MotorId, boolean>> = {}

/**
 * Direct motor control, through the hub's MOTOR socket: an open loop duty and
 * a bridge direction per motor. The hub takes both only while idle (P lets
 * go of the speed controller first), so every set is read back.
 */
export const useDirect = create<DirectStore>((set, get) => {
  const patch = (id: MotorId, p: Partial<DirectMotor>): void =>
    set((s) => ({ motors: { ...s.motors, [id]: { ...s.motors[id], ...p } } }))
  return {
    motors: { A: UNKNOWN, B: UNKNOWN },
    load: async (id) => {
      try {
        const r = await window.api.motor.get(id)
        patch(id, { duty: r.duty, requested: r.duty, direction: r.direction, error: null })
      } catch (e) {
        patch(id, { error: errorMessage(e) })
      }
    },
    setDutyLive: (id, duty) => {
      pendingDuty[id] = duty
      patch(id, { requested: duty })
      if (dutyInFlight[id]) return
      dutyInFlight[id] = true
      void (async () => {
        while (pendingDuty[id] !== undefined) {
          const next = pendingDuty[id]
          delete pendingDuty[id]
          try {
            const kept = await window.api.motor.setDuty(id, next)
            // A set that finishes after a disconnect must not bring back a value apply() has forgotten.
            if (get().motors[id].duty !== null) patch(id, { duty: kept, dutyError: null })
          } catch (e) {
            if (pendingDuty[id] === undefined && get().motors[id].duty !== null) {
              patch(id, { dutyError: { message: errorMessage(e) } })
              // The hub kept something else - show what.
              void get().load(id)
            }
          }
        }
        dutyInFlight[id] = false
      })()
    },
    // setDutyLive() already does it: its pending value is a single slot, so 0
    // replaces whatever the dial left there.
    stop: (id) => {
      patch(id, { dutyError: null, dialReset: {} })
      get().setDutyLive(id, 0)
    },
    setDirection: async (id, direction) => {
      try {
        const kept = await window.api.motor.setDirection(id, direction)
        patch(id, { direction: kept, error: null })
      } catch (e) {
        patch(id, { error: errorMessage(e) })
        void get().load(id)
      }
    }
  }
})

const loadFitted = (): void => {
  for (const id of MOTORS_FITTED) void useDirect.getState().load(id)
}

// Read the motors on each (re)connection to the hub; forget them when disconnected.
const apply = (s: CommsState): void => {
  if (s.status === 'connected' && s.kind !== 'sim') {
    loadFitted()
  } else if (s.status === 'connecting' || s.status === 'disconnected' || s.status === 'error') {
    for (const id of MOTORS_FITTED) delete pendingDuty[id]
    useDirect.setState({ motors: { A: UNKNOWN, B: UNKNOWN } })
  }
}
window.api.comms.onState(apply)
void window.api.comms.getState().then(apply)

// A run or lift move ending leaves the bridge at 0% with no direction (the
// hub sets it idle), whatever was set here before - read it again.
useHub.subscribe((s, prev) => {
  if (s.hub?.mode === 'idle' && prev.hub && prev.hub.mode !== 'idle') loadFitted()
})
