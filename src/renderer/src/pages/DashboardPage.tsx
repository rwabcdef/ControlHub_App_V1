import { Box, Grid } from '@mui/material'
import { Gauge } from '../components/Gauge'
import { Panel } from '../components/Panel'
import { StripChart } from '../components/StripChart'
import { DashboardControl } from '../layouts/DashboardControl'
import { useDisplay } from '../state/display'
import { SERIES_COLORS } from '../theme'

/**
 * The Control panel (toggled from the header) is a fixed-width column on the left.
 *
 * Layout pattern for "fill the remaining height":
 *   column flex container with height 100%  ->  fixed-height row (gauges)
 *                                           ->  flex: 1 + minHeight: 0 region (charts)
 * `minHeight: 0` is the key: without it flex children refuse to shrink below their content.
 */
export function DashboardPage(): React.JSX.Element {
  const { rpmMax, currentMax, windowSec, dashControlOpen } = useDisplay()

  return (
    <Box sx={{ height: '100%', minHeight: 480, display: 'flex', gap: 1.5 }}>
      {dashControlOpen && <DashboardControl sx={{ width: 180, flexShrink: 0 }} />}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Panel title="Speed">
              <Box sx={{ height: { xs: 140, xl: 200 } }}>
                <Gauge field="rpm" label="Speed" unit="RPM" max={rpmMax} color={SERIES_COLORS.rpm}
                  warn={rpmMax * 0.8} danger={rpmMax * 0.93} />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Panel title="PWM duty cycle">
              <Box sx={{ height: { xs: 140, xl: 200 } }}>
                <Gauge field="duty" label="Duty" unit="%" max={100} decimals={1} color={SERIES_COLORS.duty}
                  majorTicks={5} />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Panel title="Current">
              <Box sx={{ height: { xs: 140, xl: 200 } }}>
                <Gauge field="current" label="Current" unit="A" max={currentMax} decimals={2}
                  color={SERIES_COLORS.current} warn={currentMax * 0.7} danger={currentMax * 0.9} majorTicks={5} />
              </Box>
            </Panel>
          </Grid>
        </Grid>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
            gridTemplateAreas: `"speed speed" "duty current"`
          }}
        >
          <Panel sx={{ gridArea: 'speed' }}>
            <StripChart windowSec={windowSec} yLabel="RPM" series={[{ field: 'rpm', label: 'Speed (RPM)', color: SERIES_COLORS.rpm }]} />
          </Panel>
          <Panel sx={{ gridArea: 'duty' }}>
            <StripChart windowSec={windowSec} yLabel="%" yRange={[0, 100]}
              series={[{ field: 'duty', label: 'PWM duty (%)', color: SERIES_COLORS.duty }]} />
          </Panel>
          <Panel sx={{ gridArea: 'current' }}>
            <StripChart windowSec={windowSec} yLabel="A"
              series={[{ field: 'current', label: 'Current (A)', color: SERIES_COLORS.current }]} />
          </Panel>
        </Box>
      </Box>
    </Box>
  )
}
