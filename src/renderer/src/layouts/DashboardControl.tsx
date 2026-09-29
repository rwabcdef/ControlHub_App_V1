import { useState } from 'react'
import { Alert, Box, Button, Stack, TextField, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { LIFT_DISTANCE_MAX } from '@shared/types'
import { Panel } from '../components/Panel'
import { useComms } from '../state/comms'
import { useLift } from '../state/lift'
import { errorMessage } from '../util'

/** Distance box value as edges, or null unless it's a whole number in 1..LIFT_DISTANCE_MAX. */
function parseDistance(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= 1 && n <= LIFT_DISTANCE_MAX ? n : null
}

/**
 * Dashboard's Control panel: starts the hub's lift (LIFT0 socket, over MQTT)
 * for the distance entered, and shows Done once the hub reports it idle.
 */
export function DashboardControl({ sx }: { sx?: SxProps<Theme> }): React.JSX.Element {
  const connected = useComms((s) => s.state.status === 'connected')
  const { status, done, start } = useLift()
  const [distance, setDistance] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = parseDistance(distance)
  const invalid = distance.trim() !== '' && value === null
  // Why Start is disabled, if it is
  const blocked = !connected ? 'Connect first' : value === null ? 'Enter a distance (edges)' : ''

  const onStart = (): void => {
    if (blocked || value === null) return
    setError(null)
    setBusy(true)
    start(value)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false))
  }

  return (
    <Panel title="Control" sx={sx}>
      <Stack spacing={1.5}>
        <TextField label="Distance" size="small" type="number" value={distance}
          onChange={(e) => setDistance(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onStart()}
          error={invalid} helperText={invalid ? `1 to ${LIFT_DISTANCE_MAX}` : 'edges'}
          slotProps={{ htmlInput: { min: 1, max: LIFT_DISTANCE_MAX, step: 1 } }} />

        <Tooltip title={blocked}>
          {/* span: a disabled button fires no events, so the tooltip needs a wrapper */}
          <span style={{ display: 'flex' }}>
            <Button fullWidth variant="contained" startIcon={<PlayArrowIcon />} loading={busy}
              disabled={!!blocked} onClick={onStart}>
              Start
            </Button>
          </span>
        </Tooltip>

        <DoneIndicator done={done} />
        {status && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: '4px !important' }}>
            {status.travelled} / {status.target} edges
          </Typography>
        )}

        {/* Not wired up yet */}
        <Button variant="outlined" disabled>
          Reset
        </Button>

        {error && <Alert severity="error" variant="outlined" onClose={() => setError(null)}>{error}</Alert>}
      </Stack>
    </Panel>
  )
}

/** Lamp + label: greyed out until done, then green. */
function DoneIndicator({ done }: { done: boolean }): React.JSX.Element {
  return (
    <Stack direction="row" spacing={1} sx={{
      alignItems: 'center', justifyContent: 'center', py: 0.75, border: 1, borderRadius: 1,
      borderColor: done ? 'success.main' : 'divider', color: done ? 'success.main' : 'text.disabled'
    }}>
      <Box sx={(t) => ({
        width: 12, height: 12, borderRadius: '50%',
        bgcolor: done ? 'success.main' : 'action.disabled',
        boxShadow: done ? `0 0 6px ${t.palette.success.main}` : 'none'
      })} />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Done</Typography>
    </Stack>
  )
}
