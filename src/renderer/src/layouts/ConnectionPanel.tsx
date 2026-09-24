import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Button, Divider, Stack, Typography } from '@mui/material'
import type { CommsConfig } from '@shared/types'
import { useComms } from '../state/comms'

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
      <Divider />
      <Button component={Link} to="/config/comms" size="small">
        Connection settings…
      </Button>
    </Stack>
  )
}
