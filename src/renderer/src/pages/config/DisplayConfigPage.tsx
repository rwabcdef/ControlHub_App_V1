import { Button, Grid, Slider, Stack, TextField, Typography } from '@mui/material'
import { Panel } from '../../components/Panel'
import { DISPLAY_DEFAULTS, useDisplay } from '../../state/display'

/** Display preferences; applied on blur/change and persisted in localStorage. */
export function DisplayConfigPage(): React.JSX.Element {
  const { rpmMax, currentMax, windowSec, set } = useDisplay()

  const num = (v: string, fallback: number): number => (Number(v) > 0 ? Number(v) : fallback)

  return (
    <Stack spacing={2}>
      <Panel title="Gauge ranges">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth type="number" label="Speed full scale (RPM)" key={`r${rpmMax}`}
              defaultValue={rpmMax} onBlur={(e) => set({ rpmMax: num(e.target.value, rpmMax) })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth type="number" label="Current full scale (A)" key={`c${currentMax}`}
              defaultValue={currentMax}
              slotProps={{ htmlInput: { step: 0.5 } }}
              onBlur={(e) => set({ currentMax: num(e.target.value, currentMax) })} />
          </Grid>
        </Grid>
      </Panel>

      <Panel title="Charts">
        <Typography variant="body2" gutterBottom>
          Visible time window: {windowSec} s
        </Typography>
        <Slider value={windowSec} min={1} max={60} step={1} valueLabelDisplay="auto" sx={{ maxWidth: 400 }}
          onChange={(_e, v) => set({ windowSec: v as number })} />
      </Panel>

      <div>
        <Button variant="outlined" onClick={() => set(DISPLAY_DEFAULTS)}>Reset to defaults</Button>
      </div>
    </Stack>
  )
}
