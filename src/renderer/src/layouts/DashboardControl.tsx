import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Divider, MenuItem, Stack, TextField, Tooltip, Typography, type SxProps, type Theme
} from '@mui/material'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SaveIcon from '@mui/icons-material/Save'
import StopIcon from '@mui/icons-material/Stop'
import {
  CTRL_GAIN_MAX, CTRL_GAIN_SCALE, CTRL_RPM_MAX, LIFT_DISTANCE_MAX, type LiftDirection
} from '@shared/types'
import { Panel } from '../components/Panel'
import { useComms } from '../state/comms'
import { CtrlMode, useCtrl } from '../state/ctrl'
import { useLift } from '../state/lift'
import { errorMessage } from '../util'

/** Distance box value as edges, or null unless it's a whole number in 1..LIFT_DISTANCE_MAX. */
function parseDistance(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= 1 && n <= LIFT_DISTANCE_MAX ? n : null
}

/** Down's max edges: the distance box plus 20% headroom, capped at LIFT_DISTANCE_MAX. */
const downMaxEdges = (distance: number): number => Math.min(Math.ceil(distance * 1.2), LIFT_DISTANCE_MAX)

/** Control section layouts */
type MoveMode = 'upDown' | 'forRev'

const MOVE_MODES: { value: MoveMode; label: string }[] = [
  { value: 'upDown', label: 'Up/Down' },
  { value: 'forRev', label: 'For/Rev' }
]

/**
 * Dashboard's Control panel: moves the hub's lift (LIFT0 socket, over MQTT)
 * and shows Done once the hub reports it idle. Up/Down: Up starts it
 * forward for the distance, Down lowers it to the ground sensor (distance
 * + 20% at most). For/Rev: starts it for the distance and direction chosen.
 */
export function DashboardControl({ sx }: { sx?: SxProps<Theme> }): React.JSX.Element {
  const connected = useComms((s) => s.state.status === 'connected')
  const { status, done, start, down, stop } = useLift()
  const [moveMode, setMoveMode] = useState<MoveMode>('upDown')
  const [distance, setDistance] = useState('')
  // Kept between starts, so repeating a move is just Start again.
  const [direction, setDirection] = useState<LiftDirection>('forward')
  // Which move button is waiting on its send
  const [busy, setBusy] = useState<'up' | 'down' | 'start' | 'stop' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const value = parseDistance(distance)
  const invalid = distance.trim() !== '' && value === null
  // Why the move buttons are disabled, if they are
  const blocked = !connected ? 'Connect first' : value === null ? 'Enter a distance (edges)' : ''

  const run = (which: NonNullable<typeof busy>, send: () => Promise<void>): void => {
    setError(null)
    setBusy(which)
    send()
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(null))
  }
  const onMove = (which: 'up' | 'down' | 'start'): void => {
    if (blocked || value === null || busy) return
    run(which, () => which === 'up' ? start(value, 'forward')
      : which === 'down' ? down(downMaxEdges(value))
        : start(value, direction))
  }
  const onStop = (): void => {
    if (connected) run('stop', stop)
  }

  const moveButton = (which: 'up' | 'down' | 'start', label: string, icon: React.ReactNode): React.JSX.Element => (
    <Tooltip title={blocked}>
      {/* span: a disabled button fires no events, so the tooltip needs a wrapper */}
      <span style={{ display: 'flex', flex: 1 }}>
        <Button fullWidth variant="contained" startIcon={icon} loading={busy === which}
          disabled={!!blocked || (busy !== null && busy !== which)} onClick={() => onMove(which)}>
          {label}
        </Button>
      </span>
    </Tooltip>
  )

  return (
    <Panel title="Control" sx={sx}>
      <Stack spacing={1.5}>
        <TextField select label="Mode" size="small" value={moveMode}
          onChange={(e) => setMoveMode(e.target.value as MoveMode)}>
          {MOVE_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>

        <TextField label="Distance" size="small" type="number" value={distance}
          onChange={(e) => setDistance(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && moveMode === 'forRev' && onMove('start')}
          error={invalid}
          helperText={invalid ? `1 to ${LIFT_DISTANCE_MAX}`
            : moveMode === 'upDown' && value !== null ? `edges (Down: ${downMaxEdges(value)} max)` : 'edges'}
          slotProps={{ htmlInput: { min: 1, max: LIFT_DISTANCE_MAX, step: 1 } }} />

        {moveMode === 'upDown' ? (
          <Stack direction="row" spacing={1}>
            {moveButton('up', 'Up', <ArrowUpwardIcon />)}
            {moveButton('down', 'Down', <ArrowDownwardIcon />)}
          </Stack>
        ) : (
          <>
            <TextField select label="Direction" size="small" value={direction}
              onChange={(e) => setDirection(e.target.value as LiftDirection)}>
              {DIRECTIONS.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
            </TextField>
            {moveButton('start', 'Start', <PlayArrowIcon />)}
          </>
        )}

        <Tooltip title={connected ? '' : 'Connect first'}>
          <span style={{ display: 'flex' }}>
            <Button fullWidth variant="contained" color="error" startIcon={<StopIcon />}
              loading={busy === 'stop'} disabled={!connected} onClick={onStop}>
              Stop
            </Button>
          </span>
        </Tooltip>

        <DoneIndicator done={done} />
        {status && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: '4px !important' }}>
            {status.travelled} / {status.target} edges
          </Typography>
        )}

        {moveMode === 'forRev' && (
          // Not wired up yet
          <Button variant="outlined" disabled>
            Reset
          </Button>
        )}

        {error && <Alert severity="error" variant="outlined" onClose={() => setError(null)}>{error}</Alert>}

        <Divider />
        <ControllerSettings connected={connected} />
      </Stack>
    </Panel>
  )
}

/** The F / R of the LIFT0 start (BSF234 / BSR234) */
const DIRECTIONS: { value: LiftDirection; label: string }[] = [
  { value: 'forward', label: 'Forward' },
  { value: 'reverse', label: 'Reverse' }
]

const MODES: { value: CtrlMode; label: string }[] = [
  { value: 'integral', label: 'Integral' },
  { value: 'proportional', label: 'Proportional' },
  { value: 'integralProportional', label: 'Integral - Proportional' }
]

/** Gain box value, or null unless 0..CTRL_GAIN_MAX with at most 6 decimals (the hub's millionths). */
function parseGain(text: string): number | null {
  const t = text.trim()
  if (!/^(\d+(\.\d{0,6})?|\.\d{1,6})$/.test(t)) return null
  const n = Number(t)
  return n <= CTRL_GAIN_MAX ? n : null
}

/** RPM box value, or null unless a whole number in 1..CTRL_RPM_MAX. */
function parseRpm(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= 1 && n <= CTRL_RPM_MAX ? n : null
}

const sameGain = (a: number, b: number): boolean => Math.round(a * CTRL_GAIN_SCALE) === Math.round(b * CTRL_GAIN_SCALE)

/**
 * Speed controller B's settings (CTRL0 socket): read with BGA on connecting,
 * and Save sends whichever of BI (then BGI to check it) and BR changed.
 */
function ControllerSettings({ connected }: { connected: boolean }): React.JSX.Element {
  const { mode, gainI, rpm, loading, loadError, setMode, load, save } = useCtrl()
  const [gainText, setGainText] = useState('')
  const [rpmText, setRpmText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show the hub's values whenever they're read or saved.
  useEffect(() => setGainText(gainI === null ? '' : String(gainI)), [gainI])
  useEffect(() => setRpmText(rpm === null ? '' : String(rpm)), [rpm])

  const gain = parseGain(gainText)
  const rpmValue = parseRpm(rpmText)
  const gainInvalid = gainText.trim() !== '' && gain === null
  const rpmInvalid = rpmText.trim() !== '' && rpmValue === null
  const gainChanged = gain !== null && (gainI === null || !sameGain(gain, gainI))
  const rpmChanged = rpmValue !== null && rpmValue !== rpm

  // Why Save is disabled, if it is
  const blocked = !connected ? 'Connect first'
    : gainInvalid || rpmInvalid ? 'Fix the values first'
      : !gainChanged && !rpmChanged ? 'Nothing changed' : ''

  const onSave = (): void => {
    if (blocked || saving) return
    setError(null)
    setSaving(true)
    save({ gainI: gainChanged ? gain! : undefined, rpm: rpmChanged ? rpmValue! : undefined })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setSaving(false))
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') onSave()
  }

  return (
    <Stack spacing={1.5}>
      <TextField select label="Controller" size="small" value={mode}
        onChange={(e) => setMode(e.target.value as CtrlMode)}>
        {MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
      </TextField>

      {mode !== 'integral' ? (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          Not available yet
        </Typography>
      ) : (
        <>
          <TextField label="Gain" size="small" value={gainText} disabled={!connected || loading}
            onChange={(e) => setGainText(e.target.value)} onKeyDown={onKeyDown}
            error={gainInvalid} helperText={gainInvalid ? `0 to ${CTRL_GAIN_MAX}` : 'integral'}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <TextField label="RPM" size="small" type="number" value={rpmText} disabled={!connected || loading}
            onChange={(e) => setRpmText(e.target.value)} onKeyDown={onKeyDown}
            error={rpmInvalid} helperText={rpmInvalid ? `1 to ${CTRL_RPM_MAX}` : 'required'}
            slotProps={{ htmlInput: { min: 1, max: CTRL_RPM_MAX, step: 1 } }} />

          <Tooltip title={blocked}>
            <span style={{ display: 'flex' }}>
              <Button fullWidth variant="contained" startIcon={<SaveIcon />} loading={saving}
                disabled={!!blocked} onClick={onSave}>
                Save
              </Button>
            </span>
          </Tooltip>

          {loadError && (
            <Alert severity="warning" variant="outlined"
              action={<Button size="small" color="inherit" onClick={() => void load()}>Retry</Button>}>
              Couldn't read values: {loadError}
            </Alert>
          )}
          {error && <Alert severity="error" variant="outlined" onClose={() => setError(null)}>{error}</Alert>}
        </>
      )}
    </Stack>
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
