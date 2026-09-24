import { Transport, TransportEvents } from './transport'

const RATE_HZ = 1000
const TICK_MS = 10
const MAX_RPM = 6000
const TAU_S = 0.35 // mechanical time constant

/**
 * Simulated motor for UI development without hardware.
 * Sweeps duty automatically until it receives a command:
 *   "DUTY <0-100>"  set PWM duty cycle (switches to manual)
 *   "STOP"          duty = 0 (manual)
 *   "AUTO"          resume the sweep
 */
export class SimTransport implements Transport {
  private timer: NodeJS.Timeout | null = null
  private simT = 0 // simulated time, s
  private lastWall = 0
  private rpm = 0
  private duty = 0
  private auto = true

  constructor(private readonly ev: TransportEvents) {}

  async open(): Promise<void> {
    this.lastWall = performance.now()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async send(text: string): Promise<void> {
    const [cmd, arg] = text.trim().toUpperCase().split(/\s+/)
    if (cmd === 'DUTY' && Number.isFinite(Number(arg))) {
      this.auto = false
      this.duty = Math.min(100, Math.max(0, Number(arg)))
    } else if (cmd === 'STOP') {
      this.auto = false
      this.duty = 0
    } else if (cmd === 'AUTO') {
      this.auto = true
    } else {
      throw new Error(`Simulator: unknown command "${text}"`)
    }
  }

  private tick(): void {
    const now = performance.now()
    const n = Math.floor(((now - this.lastWall) * RATE_HZ) / 1000)
    this.lastWall += (n * 1000) / RATE_HZ
    const dt = 1 / RATE_HZ

    for (let i = 0; i < n; i++) {
      this.simT += dt
      if (this.auto) {
        // slow sweep with a periodic step to show transients
        const step = Math.floor(this.simT / 4) % 2 === 0 ? 0 : 20
        this.duty = 35 + 25 * Math.sin((2 * Math.PI * this.simT) / 12) + step
      }
      const target = (this.duty / 100) * MAX_RPM
      const accel = (target - this.rpm) / TAU_S // rpm/s
      this.rpm += accel * dt
      const current = 0.3 + 0.04 * this.duty + 0.0006 * accel + (Math.random() - 0.5) * 0.15

      this.ev.sample({
        t: this.simT * 1000,
        rpm: this.rpm + (Math.random() - 0.5) * 8,
        duty: this.duty,
        current: Math.max(0, current)
      })
    }
  }
}
