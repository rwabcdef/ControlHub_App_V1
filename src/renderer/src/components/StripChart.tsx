import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { Box, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { MotorField } from '@shared/types'
import { telemetry } from '../telemetry/store'
import { useTelemetryFrame } from '../telemetry/useTelemetryFrame'

export interface ChartSeries {
  field: MotorField
  label: string
  color: string
}

interface StripChartProps {
  series: ChartSeries[]
  /** Visible time window, s; the x axis scrolls with the newest sample */
  windowSec: number
  /** Fixed y range; auto-scales to the visible data if omitted */
  yRange?: [number, number]
  yLabel?: string
}

/**
 * Scrolling time-series chart built on uPlot (canvas, handles 100k+ points at 60 fps).
 * It fills its parent: give the parent a size (flex: 1 / minHeight: 0 etc.).
 */
export function StripChart({ series, windowSec, yRange, yLabel }: StripChartProps): React.JSX.Element {
  const theme = useTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const windowRef = useRef(windowSec)
  windowRef.current = windowSec

  // (Re)create the plot when its structure changes.
  const seriesKey = series.map((s) => s.field + s.color).join('|')
  useEffect(() => {
    const host = hostRef.current!
    const axis = {
      stroke: theme.palette.text.secondary,
      grid: { stroke: theme.palette.divider, width: 1 },
      ticks: { stroke: theme.palette.divider, width: 1 },
      font: `11px ${theme.typography.fontFamily}`
    }
    const opts: uPlot.Options = {
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: {
        x: { time: false },
        y: yRange ? { auto: false, range: yRange } : { auto: true }
      },
      axes: [
        { ...axis, size: 28 },
        { ...axis, label: yLabel, labelSize: yLabel ? 16 : 0, labelFont: axis.font, size: 50, space: 18 }
      ],
      series: [{}, ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.5, points: { show: false } }))]
    }
    const u = new uPlot(opts, [[], ...series.map(() => [])], host)
    plotRef.current = u

    const ro = new ResizeObserver(() => u.setSize({ width: host.clientWidth, height: host.clientHeight }))
    ro.observe(host)
    return () => {
      ro.disconnect()
      u.destroy()
      plotRef.current = null
    }
  }, [seriesKey, yRange?.[0], yRange?.[1], yLabel, theme])

  useTelemetryFrame(() => {
    const u = plotRef.current
    if (!u) return
    const t = telemetry.t
    const tMax = t.length ? t[t.length - 1] : windowRef.current
    u.batch(() => {
      // Arrays are shared by reference; uPlot only draws the points inside the x window.
      u.setData([t, ...series.map((s) => telemetry.series(s.field))] as uPlot.AlignedData, false)
      u.setScale('x', { min: tMax - windowRef.current, max: tMax })
    })
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={2} sx={{ px: 1, pb: 0.5 }}>
        {series.map((s) => (
          <Stack key={s.field} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 12, height: 3, bgcolor: s.color, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {s.label}
            </Typography>
          </Stack>
        ))}
        <Typography variant="caption" color="text.disabled" sx={{ flex: 1, textAlign: 'right' }}>
          t (s)
        </Typography>
      </Stack>
      {/* position:relative + absolute child stops the canvas size feeding back into layout */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Box ref={hostRef} sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
      </Box>
    </Box>
  )
}
