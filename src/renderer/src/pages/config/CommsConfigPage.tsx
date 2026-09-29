import { useEffect, useState } from 'react'
import {
  Alert, Button, FormControl, FormControlLabel, FormLabel, Grid, IconButton, MenuItem, Radio, RadioGroup,
  Stack, TextField, Tooltip
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import type { CommsConfig, CommsKind, SerialPortInfo } from '@shared/types'
import { Panel } from '../../components/Panel'
import { errorMessage } from '../../util'

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 2000000]

export function CommsConfigPage(): React.JSX.Element {
  const [cfg, setCfg] = useState<CommsConfig | null>(null)
  const [ports, setPorts] = useState<SerialPortInfo[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const refreshPorts = (): void => {
    window.api.comms.listPorts().then(setPorts).catch((e) => setMsg({ ok: false, text: errorMessage(e) }))
  }

  useEffect(() => {
    void window.api.comms.getConfig().then(setCfg)
    refreshPorts()
  }, [])

  if (!cfg) return <></>

  const setSerial = (p: Partial<CommsConfig['serial']>): void => setCfg({ ...cfg, serial: { ...cfg.serial, ...p } })
  const setMqtt = (p: Partial<CommsConfig['mqtt']>): void => setCfg({ ...cfg, mqtt: { ...cfg.mqtt, ...p } })

  const save = async (andConnect: boolean): Promise<void> => {
    try {
      await window.api.comms.setConfig(cfg)
      if (andConnect) await window.api.comms.connect(cfg)
      setMsg({ ok: true, text: andConnect ? 'Saved; connecting…' : 'Saved' })
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) })
    }
  }

  return (
    <Stack spacing={2}>
      <Panel title="Link">
        <FormControl>
          <FormLabel>Source</FormLabel>
          <RadioGroup row value={cfg.kind} onChange={(e) => setCfg({ ...cfg, kind: e.target.value as CommsKind })}>
            <FormControlLabel value="sim" control={<Radio />} label="Simulator" />
            <FormControlLabel value="serial" control={<Radio />} label="Serial port" />
            <FormControlLabel value="mqtt" control={<Radio />} label="MQTT" />
          </RadioGroup>
        </FormControl>
      </Panel>

      {cfg.kind === 'serial' && (
        <Panel title="Serial port">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <Stack direction="row" spacing={1}>
                <TextField select fullWidth label="Port" value={ports.some((p) => p.path === cfg.serial.path) ? cfg.serial.path : ''}
                  onChange={(e) => setSerial({ path: e.target.value })}
                  helperText={ports.length ? undefined : 'No ports found'}>
                  {ports.map((p) => (
                    <MenuItem key={p.path} value={p.path}>
                      {p.path}{p.manufacturer ? ` — ${p.manufacturer}` : ''}
                    </MenuItem>
                  ))}
                </TextField>
                <Tooltip title="Rescan ports">
                  <IconButton onClick={refreshPorts}><RefreshIcon /></IconButton>
                </Tooltip>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Baud rate" value={cfg.serial.baudRate}
                onChange={(e) => setSerial({ baudRate: Number(e.target.value) })}>
                {BAUD_RATES.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </Panel>
      )}

      {cfg.kind === 'mqtt' && (
        <Panel title="MQTT broker">
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField fullWidth label="Broker URL" value={cfg.mqtt.url} onChange={(e) => setMqtt({ url: e.target.value })}
                helperText="mqtt://host:1883, mqtts://host:8883 or ws://host:9001" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Telemetry topic" value={cfg.mqtt.telemetryTopic}
                onChange={(e) => setMqtt({ telemetryTopic: e.target.value })} helperText="SerLink up: hub → app" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Command topic" value={cfg.mqtt.commandTopic}
                onChange={(e) => setMqtt({ commandTopic: e.target.value })} helperText="SerLink down: app → hub" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Username" value={cfg.mqtt.username ?? ''} onChange={(e) => setMqtt({ username: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth type="password" label="Password" value={cfg.mqtt.password ?? ''}
                onChange={(e) => setMqtt({ password: e.target.value })} />
            </Grid>
          </Grid>
        </Panel>
      )}

      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={() => void save(true)}>Save &amp; connect</Button>
        <Button variant="outlined" onClick={() => void save(false)}>Save</Button>
      </Stack>
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} onClose={() => setMsg(null)}>{msg.text}</Alert>}
    </Stack>
  )
}
