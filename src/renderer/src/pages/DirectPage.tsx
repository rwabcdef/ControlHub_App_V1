import { Box, Button, Grid, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import StopIcon from '@mui/icons-material/Stop'
import { MOTOR_DUTY_MAX, MOTORS_FITTED, type MotorDirection, type MotorId } from '@shared/types'
import { Panel } from '../components/Panel'
import { SpeedDial } from '../components/SpeedDial'
import { useComms } from '../state/comms'
import { useDirect } from '../state/direct'
import { useHub } from '../state/hub'
import { SERIES_COLORS } from '../theme'

const MOTOR_IDS: MotorId[] = ['A', 'B']

/**
 * Direct control of the hub's motors, through its MOTOR socket (P and D):
 * an open loop duty and a bridge direction per motor, with no speed
 * controller. The hub takes them only while idle. A run or lift move started
 * meanwhile takes the motor over, and leaves it at 0% with no direction when
 * it ends. The hub sends no status frames while idle, so the Dashboard does
 * not show a motor driven from here.
 */
export function DirectPage(): React.JSX.Element {
  return (
    <Panel title="Motor" sx={{ maxWidth: 720 }}>
      <Grid container spacing={1.5}>
        {MOTOR_IDS.map((id) => (
          <Grid key={id} size={{ xs: 12, sm: 6 }}>
            <MotorSection id={id} />
          </Grid>
        ))}
      </Grid>
    </Panel>
  )
}

/**
 * One motor: its direction and its duty dial. A motor that isn't fitted
 * (MOTORS_FITTED) is drawn the same, but disabled - the hub would send its
 * commands to motorB.
 */
function MotorSection({ id }: { id: MotorId }): React.JSX.Element {
  const comms = useComms((s) => s.state)
  const hub = useHub((s) => s.hub)
  const motor = useDirect((s) => s.motors[id])
  const setDutyLive = useDirect((s) => s.setDutyLive)
  const setDirection = useDirect((s) => s.setDirection)
  const stop = useDirect((s) => s.stop)

  // Why the section is disabled, if it is
  const blocked = !MOTORS_FITTED.includes(id) ? `Motor ${id} is not fitted`
    : comms.status !== 'connected' ? 'Connect first'
      : comms.kind === 'sim' ? 'Needs a serial or MQTT connection'
        : !hub || motor.duty === null ? 'Waiting for the hub'
          : hub.mode !== 'idle' ? 'The hub is running - stop it first' : ''

  // Neither button is pressed while the bridge has no direction (disabled).
  // Pressing the pressed one again lets the motor coast.
  const pressed = motor.direction === 'forward' || motor.direction === 'reverse' ? motor.direction : null
  const onDirection = (_e: React.MouseEvent, v: MotorDirection | null): void => {
    void setDirection(id, v ?? 'disabled')
  }
  // Stop is live whenever a duty above 0 has been asked for, even before the hub has it.
  const running = (motor.requested ?? 0) > 0 || (motor.duty ?? 0) > 0

  return (
    <Panel title={`Motor ${id}`} sx={{ height: '100%' }}>
      <Tooltip title={blocked} placement="top">
        <Stack spacing={1.5}>
          <ToggleButtonGroup exclusive fullWidth size="small" value={pressed} disabled={!!blocked}
            onChange={onDirection} aria-label={`Motor ${id} direction`}>
            <ToggleButton value="forward">Forward</ToggleButton>
            <ToggleButton value="reverse">Reverse</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: '4px !important' }}>
            {motor.direction === 'disabled' ? 'No direction - the motor coasts' : ' '}
          </Typography>
          <Button fullWidth variant="contained" color="error" startIcon={<StopIcon />}
            disabled={!!blocked || !running} onClick={() => stop(id)}>
            Stop
          </Button>
          <Box sx={{ height: 160 }}>
            <SpeedDial value={motor.duty} max={MOTOR_DUTY_MAX} label="Duty" unit="%" color={SERIES_COLORS.duty}
              majorTicks={5} disabled={!!blocked} onChange={(v) => setDutyLive(id, v)} error={motor.dutyError ?? motor.dialReset} />
          </Box>
          {!blocked && (motor.dutyError || motor.error) && (
            <Typography variant="caption" color="error" sx={{ textAlign: 'center' }}>
              {motor.dutyError?.message ?? motor.error}
            </Typography>
          )}
        </Stack>
      </Tooltip>
    </Panel>
  )
}
