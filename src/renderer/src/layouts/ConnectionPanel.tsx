import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Box, Button, CircularProgress, Divider, Stack, Tooltip, Typography } from '@mui/material'
import type { CommsConfig, PingResult } from '@shared/types'
import { useComms } from '../state/comms'
import { LiftPingState, useLift } from '../state/lift'

type Tone = 'success' | 'warning' | 'error'

const PING_RESULT: Record<PingResult, { label: string; tone: Tone; hint: string }> = {
  ok: { label: 'OK', tone: 'success', hint: 'PINGBACK: the hub has a LIFT0 socket' },
  noSocket: { label: 'No socket', tone: 'warning', hint: 'Link up, but the hub has no LIFT0 socket' },
  timeout: { label: 'No answer', tone: 'error', hint: 'Link down, hub not running, or its firmware predates PING' },
  unexpected: { label: 'Unexpected reply', tone: 'warning', hint: 'Answered with neither PINGBACK nor ACK_OK' },
  error: { label: 'Error', tone: 'error', hint: 'The ping could not be sent' },
  closed: { label: 'Link closed', tone: 'error', hint: 'Disconnected before the answer' }
}

/** Left column: connection summary and connect/disconnect. */
export function ConnectionPanel(): React.JSX.Element {
  const { state, connect, disconnect } = useComms()
  const [cfg, setCfg] = useState<CommsConfig | null>(null)

  // Refresh the summary whenever the connection state changes (config may have been saved).
  useEffect(() => {
    void window.api.comms.getConfig().then(setCfg)
  }, [state])

  const busy = state.status === 'connecting'
  const live = state.status === 'connected' || state.status === 'error'

  const target =
    cfg?.kind === 'serial'
      ? `${cfg.serial.path || '(no port)'} @ ${cfg.serial.baudRate}`
      : cfg?.kind === 'mqtt'
        ? cfg.mqtt.url
        : 'Built-in motor simulator'

  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      <Typography variant="overline" color="text.secondary">
        Connection
      </Typography>
      <div>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{cfg?.kind.toUpperCase() ?? '…'}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
          {target}
        </Typography>
      </div>
      {state.error && <Alert severity="error" variant="outlined">{state.error}</Alert>}
      {live ? (
        <Button variant="outlined" color="warning" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      ) : (
        <Button variant="contained" loading={busy} onClick={() => void connect()}>
          Connect
        </Button>
      )}
      {/* LIFT0 is only on the hub's MQTT link */}
      {state.status === 'connected' && state.kind === 'mqtt' && <LiftPing />}
      <Divider />
      <Button component={Link} to="/config/comms" size="small">
        Connection settings…
      </Button>
    </Stack>
  )
}

/** Ping button for the hub's LIFT0 socket, with the ping's status below it. */
function LiftPing(): React.JSX.Element {
  const { ping, sendPing } = useLift()
  const pinging = ping.phase === 'pinging'
  return (
    <Stack spacing={1}>
      <Button variant="outlined" disabled={pinging} onClick={() => void sendPing()}>
        Ping lift
      </Button>
      <PingIndicator ping={ping} />
    </Stack>
  )
}

/** Lamp + label: grey when idle, spinner while pinging, then coloured by the result. */
function PingIndicator({ ping }: { ping: LiftPingState }): React.JSX.Element {
  const r = ping.phase === 'done' ? PING_RESULT[ping.result] : null
  const color = r ? `${r.tone}.main` : ping.phase === 'pinging' ? 'info.main' : 'text.disabled'
  const label =
    ping.phase === 'idle' ? 'Idle'
      : ping.phase === 'pinging' ? 'Pinging…'
        : ping.result === 'ok' ? `OK · ${ping.elapsedMs} ms`
          : PING_RESULT[ping.result].label
  const hint = ping.phase === 'done' ? (ping.error ?? PING_RESULT[ping.result].hint) : ''

  return (
    <Tooltip title={hint}>
      <Stack direction="row" spacing={1} sx={{
        alignItems: 'center', justifyContent: 'center', py: 0.75, border: 1, borderRadius: 1,
        borderColor: r ? color : 'divider', color
      }}>
        {ping.phase === 'pinging' ? (
          <CircularProgress size={12} color="info" />
        ) : (
          <Box sx={(t) => ({
            width: 12, height: 12, borderRadius: '50%',
            bgcolor: r ? color : 'action.disabled',
            boxShadow: r ? `0 0 6px ${t.palette[r.tone].main}` : 'none'
          })} />
        )}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
      </Stack>
    </Tooltip>
  )
}
