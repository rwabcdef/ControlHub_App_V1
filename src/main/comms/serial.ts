import { ReadlineParser, SerialPort } from 'serialport'
import { CtrlReadback, CtrlSettings, HubSocket, SerialConfig, SerialPortInfo } from '@shared/types'
import { HubLink } from './hubLink'
import { Transport, TransportEvents } from './transport'

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  const ports = await SerialPort.list()
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer,
    serialNumber: p.serialNumber,
    vendorId: p.vendorId,
    productId: p.productId
  }))
}

/**
 * Serial transport: SerLink over newline-terminated lines, as the hub's uart2.
 * Non-SerLink lines are parsed as plain JSON / CSV telemetry.
 */
export class SerialTransport implements Transport {
  private port: SerialPort | null = null
  private link: HubLink | null = null

  constructor(
    private readonly cfg: SerialConfig,
    private readonly ev: TransportEvents
  ) {}

  open(): Promise<void> {
    if (!this.cfg.path) return Promise.reject(new Error('No serial port selected'))
    const port = new SerialPort({ path: this.cfg.path, baudRate: this.cfg.baudRate, autoOpen: false })
    this.port = port
    const link = new HubLink((line) => this.writeLine(port, line), this.ev)
    this.link = link
    port.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', (line: string) => link.receiveLine(line))
    port.on('error', (err) => this.ev.error(err))
    port.on('close', () => this.ev.close())
    return new Promise((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())))
  }

  close(): Promise<void> {
    this.link?.close()
    this.link = null
    const port = this.port
    this.port = null
    if (!port?.isOpen) return Promise.resolve()
    port.removeAllListeners('close')
    return new Promise((resolve) => port.close(() => resolve()))
  }

  send(text: string): Promise<string | undefined> {
    if (!this.link || !this.port?.isOpen) return Promise.reject(new Error('Serial port not open'))
    return this.link.send(text)
  }

  socketSend(protocol: HubSocket, data: string, ack: boolean): Promise<string | undefined> {
    if (!this.link || !this.port?.isOpen) return Promise.reject(new Error('Serial port not open'))
    return this.link.socketSend(protocol, data, ack)
  }

  ctrlGet(): Promise<CtrlReadback> {
    if (!this.link || !this.port?.isOpen) return Promise.reject(new Error('Serial port not open'))
    return this.link.ctrlGet()
  }

  ctrlSet(s: Partial<CtrlSettings>): Promise<Partial<CtrlSettings>> {
    if (!this.link || !this.port?.isOpen) return Promise.reject(new Error('Serial port not open'))
    return this.link.ctrlSet(s)
  }

  private writeLine(port: SerialPort, line: string): Promise<void> {
    if (!port.isOpen) return Promise.reject(new Error('Serial port not open'))
    return new Promise((resolve, reject) => port.write(line + '\n', (err) => (err ? reject(err) : resolve())))
  }
}
