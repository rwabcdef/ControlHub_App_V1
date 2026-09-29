import { useState } from 'react'
import { Alert, Button, Slider, Stack, TextField, Typography } from '@mui/material'
import StopIcon from '@mui/icons-material/Stop'
import { useComms } from '../state/comms'
import { errorMessage } from '../util'

/**
 * Right column: motor commands. Commands are plain text lines sent to the device;
 * the buttons' formats are placeholders matching the simulator. Over serial / MQTT
 * a raw command is sent to the hub's CTRL0 socket (e.g. BR0120), or as is if it's a
 * complete SerLink frame (e.g. CTRL0T516006BR0120).
 */
export function ControlPanel(): React.JSX.Element {
  const connected = useComms((s) => s.state.status === 'connected')
  const [duty, setDuty] = useState(40)
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState<string | null>(null)

  const send = (text: string): void => {
    setError(null)
    setReply(null)
    window.api.comms
      .send(text)
      .then((r) => setReply(r ?? null))
      .catch((e) => setError(errorMessage(e)))
  }

  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      <Typography variant="overline" color="text.secondary">
        Motor control
      </Typography>

      <div>
        <Typography variant="body2" gutterBottom>
          Duty setpoint: {duty}%
        </Typography>
        <Slider value={duty} min={0} max={100} disabled={!connected} valueLabelDisplay="auto"
          onChange={(_e, v) => setDuty(v as number)} onChangeCommitted={(_e, v) => send(`DUTY ${v}`)} />
      </div>

      <Stack direction="row" spacing={1}>
        <Button fullWidth variant="contained" color="error" startIcon={<StopIcon />} disabled={!connected}
          onClick={() => send('STOP')}>
          Stop
        </Button>
        <Button fullWidth variant="outlined" disabled={!connected} onClick={() => send('AUTO')}>
          Auto
        </Button>
      </Stack>

      <form onSubmit={(e) => { e.preventDefault(); if (raw.trim()) send(raw.trim()) }}>
        <Stack direction="row" spacing={1}>
          <TextField label="Raw command" value={raw} onChange={(e) => setRaw(e.target.value)} disabled={!connected} fullWidth />
          <Button type="submit" variant="outlined" disabled={!connected}>Send</Button>
        </Stack>
      </form>

      {reply && <Alert severity="info" variant="outlined" onClose={() => setReply(null)}>Reply: {reply}</Alert>}
      {error && <Alert severity="error" variant="outlined" onClose={() => setError(null)}>{error}</Alert>}
    </Stack>
  )
}
