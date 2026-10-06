import { useState } from 'react'
import {
  Alert, Box, Button, Chip, Divider, MenuItem, Stack, TextField, Tooltip, Typography, type SxProps, type Theme
} from '@mui/material'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { LIFT_DISTANCE_MAX, type CtrlDirection, type HubState, type LiftDirection } from '@shared/types'
import { Panel } from '../components/Panel'
import { useComms } from '../state/comms'
import { useControlHub } from '../state/controlHub'
import { useCtrl } from '../state/ctrl'
import { useHub } from '../state/hub'
import { useLift } from '../state/lift'
import { errorMessage } from '../util'

/** Down's max edges: the distance plus 20% headroom, capped at LIFT_DISTANCE_MAX. */
const downMaxEdges = (distance: number): number => Math.min(Math.ceil(distance * 1.2), LIFT_DISTANCE_MAX)

/** Lift section layouts */
type MoveMode = 'upDown' | 'forRev'

const MOVE_MODES: { value: MoveMode; label: string }[] = [
  { value: 'upDown', label: 'Up/Down' },
  { value: 'forRev', label: 'For/Rev' }
]

const DIRECTIONS: { value: CtrlDirection & LiftDirection; label: string }[] = [
  { value: 'forward', label: 'Forward' },
  { value: 'reverse', label: 'Reverse' }
]

type Busy = 'start' | 'stop' | 'direction' | 'up' | 'down' | 'move' | null

/**
 * Dashboard's Control panel. The hub (HubApp in the firmware) is in one mode
 * at a time - Idle, Control or Lift - and ignores a start unless Idle, so
 * the start buttons are only enabled then. Stop ends either.
 *
 * Control: a run at the target speed (Config -> ControlHub) in the chosen
 * direction, until stopped - from here or from the remote hub.
 * Lift: Up/Down moves the lift up by the configured distance, or down to its
 * ground sensor (the distance + 20% at most); For/Rev moves it the distance
 * in the direction chosen. The hub reports the move's end (Done).
 */
export function DashboardControl({ sx }: { sx?: SxProps<Theme> }): React.JSX.Element {
  const connected = useComms((s) => s.state.status === 'connected')
  const hub = useHub((s) => s.hub)
  const ctrl = useCtrl()
  const lift = useLift()
  const liftDistance = useControlHub((s) => s.liftDistance)
  const [moveMode, setMoveMode] = useState<MoveMode>('upDown')
  // Kept between starts, so repeating a move is just Start again.
  const [liftDirection, setLiftDirection] = useState<LiftDirection>('forward')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  const idle = hub?.mode === 'idle'
  // Why the start buttons are disabled, if they are
  const blocked = !connected ? 'Connect first'
    : !hub ? 'Waiting for the hub'
      : !idle ? 'The hub is running - stop it first' : ''

  const run = (which: NonNullable<Busy>, send: () => Promise<void>): void => {
    if (busy) return
    setError(null)
    setBusy(which)
    send()
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(null))
  }

  const button = (which: NonNullable<Busy>, label: string, icon: React.ReactNode, send: () => Promise<void>,
    reason = blocked): React.JSX.Element => (
    <Tooltip title={reason}>
      {/* span: a disabled button fires no events, so the tooltip needs a wrapper */}
      <span style={{ display: 'flex', flex: 1 }}>
        <Button fullWidth variant="contained" startIcon={icon} loading={busy === which}
          disabled={!!reason || (busy !== null && busy !== which)} onClick={() => run(which, send)}>
          {label}
        </Button>
      </span>
    </Tooltip>
  )

  return (
    <Panel title="Control" action={<ModeChip hub={hub} />} sx={sx}>
      <Stack spacing={1.5}>
        <Typography variant="overline" sx={{ lineHeight: 1.5 }}>Control</Typography>
        <TextField select label="Direction" size="small" value={hub?.direction ?? 'forward'}
          disabled={!!blocked || busy !== null}
          onChange={(e) => run('direction', () => ctrl.setDirection(e.target.value as CtrlDirection))}>
          {DIRECTIONS.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
        </TextField>
        {button('start', 'Start', <PlayArrowIcon />, ctrl.start)}
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: '4px !important' }}>
          at {ctrl.rpm ?? '-'} RPM
        </Typography>

        <Divider />

        <Typography variant="overline" sx={{ lineHeight: 1.5 }}>Lift</Typography>
        <TextField select label="Mode" size="small" value={moveMode}
          onChange={(e) => setMoveMode(e.target.value as MoveMode)}>
          {MOVE_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>

        {moveMode === 'upDown' ? (
          <Stack direction="row" spacing={1}>
            {button('up', 'Up', <ArrowUpwardIcon />, () => lift.start(liftDistance, 'forward'))}
            {button('down', 'Down', <ArrowDownwardIcon />, () => lift.down(downMaxEdges(liftDistance)))}
          </Stack>
        ) : (
          <>
            <TextField select label="Direction" size="small" value={liftDirection}
              onChange={(e) => setLiftDirection(e.target.value as LiftDirection)}>
              {DIRECTIONS.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
            </TextField>
            {button('move', 'Start', <PlayArrowIcon />, () => lift.start(liftDistance, liftDirection))}
          </>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: '4px !important' }}>
          {liftDistance} edges{moveMode === 'upDown' ? ` (Down: ${downMaxEdges(liftDistance)} max)` : ''}
        </Typography>

        <DoneIndicator done={lift.done} />
        {lift.status && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: '4px !important' }}>
            {lift.status.travelled} / {lift.status.target} edges
          </Typography>
        )}

        <Divider />

        {button('stop', 'Stop', <StopIcon />, ctrl.stop, connected ? '' : 'Connect first')}

        {error && <Alert severity="error" variant="outlined" onClose={() => setError(null)}>{error}</Alert>}
      </Stack>
    </Panel>
  )
}

const MODE_LABEL = { idle: 'Idle', control: 'Control', lift: 'Lift' } as const
const MODE_COLOR = { idle: 'default', control: 'success', lift: 'info' } as const
const SOURCE_LABEL = { pc: 'PC', remote: 'Remote', none: '' } as const

/** The hub's mode, and who started the run: e.g. "Control · Remote". */
function ModeChip({ hub }: { hub: HubState | null }): React.JSX.Element {
  if (!hub) return <Chip size="small" variant="outlined" label="—" />
  const source = hub.source ? SOURCE_LABEL[hub.source] : ''
  return (
    <Chip size="small" color={MODE_COLOR[hub.mode]} variant={hub.mode === 'idle' ? 'outlined' : 'filled'}
      label={source ? `${MODE_LABEL[hub.mode]} · ${source}` : MODE_LABEL[hub.mode]} />
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
