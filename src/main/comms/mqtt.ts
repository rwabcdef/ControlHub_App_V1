import { connect, MqttClient } from 'mqtt'
import { CtrlReadback, CtrlSettings, HubSocket, LiftDirection, MqttConfig, PingReport } from '@shared/types'
import { HubLink } from './hubLink'
import { Transport, TransportEvents } from './transport'

const CONNECT_TIMEOUT_MS = 5000

/**
 * MQTT transport: SerLink over MQTT, as the hub's SerLinkMqttAdapter. Each
 * payload is a serialised frame exactly as it would appear on the uart (hub
 * publishes on telemetryTopic, subscribes to commandTopic). A payload may
 * hold several newline-separated lines; non-SerLink lines are parsed as
 * plain JSON / CSV telemetry.
 */
export class MqttTransport implements Transport {
  private client: MqttClient | null = null
  private link: HubLink | null = null

  constructor(
    private readonly cfg: MqttConfig,
    private readonly ev: TransportEvents
  ) {}

  open(): Promise<void> {
    // Brokers deliver to the publisher too, so we'd receive (and ack) our own frames.
    if (this.cfg.telemetryTopic === this.cfg.commandTopic) {
      return Promise.reject(new Error('Telemetry and command topics must differ'))
    }
    const client = connect(this.cfg.url, {
      username: this.cfg.username || undefined,
      password: this.cfg.password || undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectPeriod: 2000
    })
    this.client = client

    const link = new HubLink(async (line) => {
      if (!client.connected) throw new Error('MQTT not connected')
      await client.publishAsync(this.cfg.commandTopic, line + '\n')
    }, this.ev, { lift: true })
    this.link = link

    client.on('message', (topic, payload) => {
      if (topic !== this.cfg.telemetryTopic) return
      for (const line of payload.toString().split('\n')) link.receiveLine(line)
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
    this.link?.close()
    this.link = null
    const client = this.client
    this.client = null
    if (!client) return
    client.removeAllListeners('end')
    await client.endAsync()
  }

  send(text: string): Promise<string | undefined> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.send(text)
  }

  socketSend(protocol: HubSocket, data: string, ack: boolean): Promise<string | undefined> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.socketSend(protocol, data, ack)
  }

  ctrlGet(): Promise<CtrlReadback> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.ctrlGet()
  }

  ctrlSet(s: Partial<CtrlSettings>): Promise<Partial<CtrlSettings>> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.ctrlSet(s)
  }

  liftStart(distance: number, direction: LiftDirection): Promise<void> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.liftStart(distance, direction)
  }

  liftDown(maxEdges: number): Promise<void> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.liftDown(maxEdges)
  }

  liftStop(): Promise<void> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.liftStop()
  }

  liftPing(): Promise<PingReport> {
    if (!this.link || !this.client?.connected) return Promise.reject(new Error('MQTT not connected'))
    return this.link.liftPing()
  }
}
