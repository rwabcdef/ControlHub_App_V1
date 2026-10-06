import { useEffect, useState } from 'react'
import { Alert, Button, Grid, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import {
  CTRL_DUTY_MAX, CTRL_DUTY_MIN, CTRL_GAIN_MAX, CTRL_GAIN_SCALE, CTRL_RPM_MAX, LIFT_DISTANCE_MAX
} from '@shared/types'
import { Panel } from '../../components/Panel'
import { useComms } from '../../state/comms'
import { useControlHub } from '../../state/controlHub'
import { CtrlMode, useCtrl } from '../../state/ctrl'
import { errorMessage } from '../../util'

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

/** A whole number in min..max from a text box, or null. */
function parseWhole(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text)
  return n >= min && n <= max ? n : null
}

const sameGain = (a: number, b: number): boolean => Math.round(a * CTRL_GAIN_SCALE) === Math.round(b * CTRL_GAIN_SCALE)

/**
 * Config -> ControlHub. The controller settings live on the hub (CTRL0: BI
 * gain, BM max duty, BR target speed - read on connecting, sent on Save) and
 * apply to Control runs and lift moves alike; none of them starts anything.
 * The lift distance is kept by the app, and used by the dashboard's lift
 * buttons.
 */
export function ControlHubConfigPage(): React.JSX.Element {
  return (
    <Stack spacing={2}>
      <ControllerPanel />
      <LiftPanel />
    </Stack>
  )
}

function ControllerPanel(): React.JSX.Element {
  const connected = useComms((s) => s.state.status === 'connected')
  const { mode, gainI, rpm, maxDuty, loading, loadError, setMode, load, save } = useCtrl()
  const [gainText, setGainText] = useState('')
  const [dutyText, setDutyText] = useState('')
  const [rpmText, setRpmText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show the hub's values whenever they're read or saved.
  useEffect(() => setGainText(gainI === null ? '' : String(gainI)), [gainI])
  useEffect(() => setDutyText(maxDuty === null ? '' : String(maxDuty)), [maxDuty])
  useEffect(() => setRpmText(rpm === null ? '' : String(rpm)), [rpm])

  const gain = parseGain(gainText)
  const duty = parseWhole(dutyText, CTRL_DUTY_MIN, CTRL_DUTY_MAX)
  const rpmValue = parseWhole(rpmText, 1, CTRL_RPM_MAX)
  const gainInvalid = gainText.trim() !== '' && gain === null
  const dutyInvalid = dutyText.trim() !== '' && duty === null
  const rpmInvalid = rpmText.trim() !== '' && rpmValue === null
  const gainChanged = gain !== null && (gainI === null || !sameGain(gain, gainI))
  const dutyChanged = duty !== null && duty !== maxDuty
  const rpmChanged = rpmValue !== null && rpmValue !== rpm

  // Why Save is disabled, if it is
  const blocked = !connected ? 'Connect first'
    : gainInvalid || dutyInvalid || rpmInvalid ? 'Fix the values first'
      : !gainChanged && !dutyChanged && !rpmChanged ? 'Nothing changed' : ''

  const onSave = (): void => {
    if (blocked || saving) return
    setError(null)
    setSaving(true)
    save({
      gainI: gainChanged ? gain! : undefined,
      maxDuty: dutyChanged ? duty! : undefined,
      rpm: rpmChanged ? rpmValue! : undefined
    })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setSaving(false))
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') onSave()
  }

  return (
    <Panel title="Speed controller (Control and Lift)">
      <Stack spacing={2}>
        <TextField select label="Controller" size="small" value={mode} sx={{ maxWidth: 300 }}
          onChange={(e) => setMode(e.target.value as CtrlMode)}>
          {MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>

        {mode !== 'integral' ? (
          <Typography variant="body2" color="text.secondary">Not available yet</Typography>
        ) : (
          <>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth label="Gain" size="small" value={gainText} disabled={!connected || loading}
                  onChange={(e) => setGainText(e.target.value)} onKeyDown={onKeyDown}
                  error={gainInvalid} helperText={gainInvalid ? `0 to ${CTRL_GAIN_MAX}` : 'integral'}
                  slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth label="Max duty" size="small" type="number" value={dutyText}
                  disabled={!connected || loading}
                  onChange={(e) => setDutyText(e.target.value)} onKeyDown={onKeyDown}
                  error={dutyInvalid} helperText={dutyInvalid ? `${CTRL_DUTY_MIN} to ${CTRL_DUTY_MAX}` : '%'}
                  slotProps={{ htmlInput: { min: CTRL_DUTY_MIN, max: CTRL_DUTY_MAX, step: 1 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth label="Target speed" size="small" type="number" value={rpmText}
                  disabled={!connected || loading}
                  onChange={(e) => setRpmText(e.target.value)} onKeyDown={onKeyDown}
                  error={rpmInvalid} helperText={rpmInvalid ? `1 to ${CTRL_RPM_MAX}` : 'RPM'}
                  slotProps={{ htmlInput: { min: 1, max: CTRL_RPM_MAX, step: 1 } }} />
              </Grid>
            </Grid>

            <Typography variant="caption" color="text.secondary">
              Applied at once, also to a run in progress. A run started from the remote hub takes its
              speed from the remote's pot instead.
            </Typography>

            <div>
              <Tooltip title={blocked}>
                <span>
                  <Button variant="contained" startIcon={<SaveIcon />} loading={saving}
                    disabled={!!blocked} onClick={onSave}>
                    Save to hub
                  </Button>
                </span>
              </Tooltip>
            </div>

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
    </Panel>
  )
}

function LiftPanel(): React.JSX.Element {
  const { liftDistance, save } = useControlHub()
  const [text, setText] = useState(String(liftDistance))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setText(String(liftDistance)), [liftDistance])

  const value = parseWhole(text, 1, LIFT_DISTANCE_MAX)
  const invalid = value === null

  const onSave = (): void => {
    if (value === null || value === liftDistance) return
    setError(null)
    save({ liftDistance: value }).catch((e) => setError(errorMessage(e)))
  }

  return (
    <Panel title="Lift">
      <Stack spacing={2}>
        <TextField label="Target distance" size="small" type="number" value={text} sx={{ maxWidth: 300 }}
          onChange={(e) => setText(e.target.value)} onBlur={onSave}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
          error={invalid}
          helperText={invalid ? `1 to ${LIFT_DISTANCE_MAX}` : 'tacho edges (2 per revolution) - saved on leaving the box'}
          slotProps={{ htmlInput: { min: 1, max: LIFT_DISTANCE_MAX, step: 1 } }} />
        {error && <Alert severity="error" variant="outlined" onClose={() => setError(null)}>{error}</Alert>}
      </Stack>
    </Panel>
  )
}
