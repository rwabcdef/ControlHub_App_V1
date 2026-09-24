import { connect, MqttClient } from 'mqtt'
import { MqttConfig } from '@shared/types'
import { parseLine } from './parser'
import { Transport, TransportEvents } from './transport'

const CONNECT_TIMEOUT_MS = 5000

/** MQTT transport: telemetry payloads may contain one or more newline-separated lines. */
export class MqttTransport implements Transport {
  private client: MqttClient | null = null

  constructor(
    private readonly cfg: MqttConfig,
    private readonly ev: TransportEvents
  ) {}

  open(): Promise<void> {
    const client = connect(this.cfg.url, {
      username: this.cfg.username || undefined,
      password: this.cfg.password || undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectPeriod: 2000
    })
    this.client = client

    client.on('message', (_topic, payload) => {
      for (const line of payload.toString().split('\n')) {
        const s = parseLine(line)
        if (s) this.ev.sample(s)
      }
    })

    return new Promise((resolve, reject) => {
      // mqtt.js silently retries refused connections, so enforce our own timeout.
      const timer = setTimeout(() => {
        client.end(true)
        reject(new Error(`Could not connect to ${this.cfg.url}`))
      }, CONNECT_TIMEOUT_MS + 1000)

      client.once('connect', () => {
        client.subscribe(this.cfg.telemetryTopic, (err) => {
          clearTimeout(timer)
          if (err) return reject(err)
          // Only report errors/closure once the initial connection has succeeded.
          client.on('error', (e) => this.ev.error(e))
          client.on('offline', () => this.ev.error(new Error('MQTT broker offline, reconnecting…')))
          client.on('connect', () => this.ev.reconnected())
          client.on('end', () => this.ev.close())
          resolve()
        })
      })
      client.once('error', (err) => {
        clearTimeout(timer)
        client.end(true)
        reject(err)
      })
    })
  }

  async close(): Promise<void> {
    const client = this.client
    this.client = null
    if (!client) return
    client.removeAllListeners('end')
    await client.endAsync()
  }

  async send(text: string): Promise<void> {
    if (!this.client?.connected) throw new Error('MQTT not connected')
    await this.client.publishAsync(this.cfg.commandTopic, text)
  }
}
