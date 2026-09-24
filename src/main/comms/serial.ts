import { ReadlineParser, SerialPort } from 'serialport'
import { SerialConfig, SerialPortInfo } from '@shared/types'
import { parseLine } from './parser'
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

/** Line-oriented serial transport (newline-terminated telemetry and commands). */
export class SerialTransport implements Transport {
  private port: SerialPort | null = null

  constructor(
    private readonly cfg: SerialConfig,
    private readonly ev: TransportEvents
  ) {}

  open(): Promise<void> {
    if (!this.cfg.path) return Promise.reject(new Error('No serial port selected'))
    const port = new SerialPort({ path: this.cfg.path, baudRate: this.cfg.baudRate, autoOpen: false })
    this.port = port
    port.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', (line: string) => {
      const s = parseLine(line)
      if (s) this.ev.sample(s)
    })
    port.on('error', (err) => this.ev.error(err))
    port.on('close', () => this.ev.close())
    return new Promise((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())))
  }

  close(): Promise<void> {
    const port = this.port
    this.port = null
    if (!port?.isOpen) return Promise.resolve()
    port.removeAllListeners('close')
    return new Promise((resolve) => port.close(() => resolve()))
  }

  send(text: string): Promise<void> {
    const port = this.port
    if (!port?.isOpen) return Promise.reject(new Error('Serial port not open'))
    const line = text.endsWith('\n') ? text : text + '\n'
    return new Promise((resolve, reject) => port.write(line, (err) => (err ? reject(err) : resolve())))
  }
}
