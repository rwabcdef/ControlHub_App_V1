import { useState } from 'react'
import { Box, Button, Checkbox, FormControlLabel, Grid, Stack, TextField, Tooltip, Typography } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import type { HubClockReading, HubSocket } from '@shared/types'
import { Panel } from '../components/Panel'
import { useComms } from '../state/comms'
import { errorMessage } from '../util'

/** Sends kept in each socket's history */
const HISTORY = 20

/** Dev tools: raw data to the hub's SerLink sockets, and a read of its clock. */
export function DevPage(): React.JSX.Element {
  return (
    <Grid container spacing={1.5}>
      <Grid size={{ xs: 12, md: 6 }}>
        <SocketSender protocol="LIFT0" placeholder="e.g. BSF234" defaultAck={false} mqttOnly />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <SocketSender protocol="CTRL0" placeholder="e.g. BGA" defaultAck />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <HubClockPanel />
      </Grid>
    </Grid>
  )
}

interface Sent {
  id: number
  time: string
  frame: 'T' | 'U'
  payload: string
  /** Undefined while waiting for the ack */
  ok?: boolean
  reply?: string
}

interface SocketSenderProps {
  protocol: HubSocket
  placeholder: string
  /** Send as 'T' (acked) rather than 'U' by default */
  defaultAck: boolean
  /** The socket only exists on the hub's MQTT link */
  mqttOnly?: boolean
}

let nextId = 1

/** Payload box + Send for one socket, with the recent sends and their outcomes. */
function SocketSender({ protocol, placeholder, defaultAck, mqttOnly }: SocketSenderProps): React.JSX.Element {
  const comms = useComms((s) => s.state)
  const [payload, setPayload] = useState('')
  const [ack, setAck] = useState(defaultAck)
  const [history, setHistory] = useState<Sent[]>([])

  // Why Send is disabled, if it is
  const blocked =
    comms.status !== 'connected' ? 'Connect first'
      : comms.kind === 'sim' ? 'Needs a serial or MQTT connection'
        : mqttOnly && comms.kind !== 'mqtt' ? `${protocol} is only available over MQTT`
          : !payload.trim() ? 'Enter a payload' : ''

  const update = (id: number, patch: Partial<Sent>): void =>
    setHistory((h) => h.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const onSend = (): void => {
    if (blocked) return
    const text = payload.trim()
    const id = nextId++
    const time = new Date().toLocaleTimeString()
    const sent: Sent = { id, time, frame: ack ? 'T' : 'U', payload: text }
    setHistory((h) => [sent, ...h].slice(0, HISTORY))
    window.api.comms
      .socketSend(protocol, text, ack)
      .then((r) => update(id, { ok: true, reply: r }))
      .catch((e) => update(id, { ok: false, reply: errorMessage(e) }))
  }

  return (
    <Panel title={protocol.toLowerCase()} action={history.length > 0 && (
      <Button size="small" onClick={() => setHistory([])}>Clear</Button>
    )}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField label={`${protocol} payload`} placeholder={placeholder} size="small" fullWidth value={payload}
            onChange={(e) => setPayload(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSend()}
            slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace' } } }} />
          <Tooltip title={blocked}>
            {/* span: a disabled button fires no events, so the tooltip needs a wrapper */}
            <span>
              <Button variant="contained" endIcon={<SendIcon />} disabled={!!blocked} onClick={onSend}>
                Send
              </Button>
            </span>
          </Tooltip>
        </Stack>
        <Tooltip title="On: 'T' frame, waits for the hub's ack (and shows any data on it). Off: 'U' frame, no ack.">
          <FormControlLabel label="Ack ('T' frame)" sx={{ alignSelf: 'flex-start' }}
            control={<Checkbox size="small" checked={ack} onChange={(e) => setAck(e.target.checked)} />} />
        </Tooltip>

        {history.length > 0 && (
          <Box sx={{ fontFamily: 'monospace', fontSize: 13, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            {history.map((s) => (
              <Typography key={s.id} component="div" sx={{ font: 'inherit', display: 'flex', gap: 1 }}>
                <Box component="span" sx={{ color: 'text.secondary' }}>{s.time}</Box>
                <span>{s.frame} {s.payload}</span>
                <Box component="span" sx={{
                  color: s.ok === undefined ? 'text.secondary' : s.ok ? 'success.main' : 'error.main'
                }}>
                  {s.ok === undefined ? '…' : s.ok ? `✓${s.reply ? ` ${s.reply}` : ''}` : `✗ ${s.reply}`}
                </Box>
              </Typography>
            ))}
          </Box>
        )}
      </Stack>
    </Panel>
  )
}

/**
 * The hub's clock, read on demand with RTC00 G (G120261023143007). The PC
 * apps set it once per run on connecting - Config -> ControlHub, "Set hub
 * date time on app launch".
 */
function HubClockPanel(): React.JSX.Element {
  const comms = useComms((s) => s.state)
  const [reading, setReading] = useState<HubClockReading | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Why Get is disabled, if it is
  const blocked =
    comms.status !== 'connected' ? 'Connect first'
      : comms.kind === 'sim' ? 'Needs a serial or MQTT connection' : ''

  const onGet = (): void => {
    if (blocked || busy) return
    setBusy(true)
    setError(null)
    window.api.rtc
      .get()
      .then(setReading)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false))
  }

  return (
    <Panel title="hub clock">
      <Stack spacing={1.5}>
        <TextField label="Date / time" size="small" fullWidth value={reading?.dateTime ?? ''}
          error={!!error}
          helperText={error ?? (reading && !reading.isSet ? 'Not set since power up' : "The hub's local time")}
          slotProps={{ htmlInput: { readOnly: true, style: { fontFamily: 'monospace' } } }} />
        <Tooltip title={blocked}>
          <span style={{ alignSelf: 'flex-start' }}>
            <Button variant="contained" loading={busy} disabled={!!blocked} onClick={onGet}>Get</Button>
          </span>
        </Tooltip>
      </Stack>
    </Panel>
  )
}
