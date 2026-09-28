import { useMemo, useRef } from 'react'
import { useTheme } from '@mui/material/styles'
import type { MotorField } from '@shared/types'
import { telemetry } from '../telemetry/store'
import { useTelemetryFrame } from '../telemetry/useTelemetryFrame'

interface GaugeProps {
  field: MotorField
  label: string
  unit: string
  min?: number
  max: number
  decimals?: number
  color: string
  /** Values at/above this are drawn amber */
  warn?: number
  /** Values at/above this are drawn red */
  danger?: number
  majorTicks?: number
}

// Geometry in SVG user units; the SVG scales to fill its container.
const CX = 100
const CY = 100
const R = 80
const START = 150 // degrees, clockwise from +x (lower-left)
const SWEEP = 240
const TEXT_INTERVAL_MS = 100 // numeric readout at 10 Hz is easier to read than 60 Hz

const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}
const arc = (r: number, a0: number, a1: number): string => {
  const [x0, y0] = polar(r, a0)
  const [x1, y1] = polar(r, a1)
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}
const fmtTick = (v: number): string => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${+v.toFixed(2)}`)

/** Speedometer-style gauge. Needle and readout are updated imperatively each frame. */
export function Gauge(props: GaugeProps): React.JSX.Element {
  const { field, label, unit, min = 0, max, decimals = 0, color, warn, danger, majorTicks = 6 } = props
  const theme = useTheme()
  const needleRef = useRef<SVGGElement>(null)
  const valueArcRef = useRef<SVGPathElement>(null)
  const textRef = useRef<SVGTextElement>(null)
  const lastText = useRef(0)

  const frac = (v: number): number => Math.min(1, Math.max(0, (v - min) / (max - min)))
  const angle = (v: number): number => START + frac(v) * SWEEP

  useTelemetryFrame(() => {
    const latest = telemetry.latest?.[field]
    const has = latest !== undefined && Number.isFinite(latest)
    const v = has ? latest : min
    const f = frac(v)
    needleRef.current?.setAttribute('transform', `rotate(${START + f * SWEEP} ${CX} ${CY})`)
    valueArcRef.current?.setAttribute('stroke-dasharray', `${f * 1000} 1000`)
    const now = performance.now()
    if (textRef.current && now - lastText.current > TEXT_INTERVAL_MS) {
      lastText.current = now
      textRef.current.textContent = has ? v.toFixed(decimals) : '—'
    }
  })

  const ticks = useMemo(() => {
    const out: React.JSX.Element[] = []
    const minorPerMajor = 4
    const n = majorTicks * minorPerMajor
    for (let i = 0; i <= n; i++) {
      const v = min + ((max - min) * i) / n
      const a = START + (SWEEP * i) / n
      const major = i % minorPerMajor === 0
      const [x0, y0] = polar(R - (major ? 10 : 5), a)
      const [x1, y1] = polar(R, a)
      out.push(
        <line key={`t${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke={theme.palette.text.secondary}
          strokeWidth={major ? 1.5 : 0.75} />
      )
      if (major) {
        const [lx, ly] = polar(R - 20, a)
        out.push(
          <text key={`l${i}`} x={lx} y={ly} fontSize={8.5} fill={theme.palette.text.secondary}
            textAnchor="middle" dominantBaseline="central">
            {fmtTick(v)}
          </text>
        )
      }
    }
    return out
  }, [min, max, majorTicks, theme])

  const track = theme.palette.action.hover

  return (
    <svg viewBox="0 12 200 150" width="100%" height="100%" role="img" aria-label={label}>
      <path d={arc(R + 6, START, START + SWEEP)} stroke={track} strokeWidth={6} fill="none" />
      <path ref={valueArcRef} d={arc(R + 6, START, START + SWEEP)} stroke={color} strokeWidth={6} fill="none"
        pathLength={1000} strokeDasharray="0 1000" />
      {warn !== undefined && (
        <path d={arc(R + 1, angle(warn), angle(danger ?? max))} stroke={theme.palette.warning.main}
          strokeWidth={2} fill="none" />
      )}
      {danger !== undefined && (
        <path d={arc(R + 1, angle(danger), START + SWEEP)} stroke={theme.palette.error.main} strokeWidth={2}
          fill="none" />
      )}
      {ticks}
      <g ref={needleRef} transform={`rotate(${START} ${CX} ${CY})`}>
        <line x1={CX - 10} y1={CY} x2={CX + R - 6} y2={CY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      </g>
      <circle cx={CX} cy={CY} r={5} fill={theme.palette.background.paper} stroke={color} strokeWidth={2} />
      <text ref={textRef} x={CX} y={CY + 30} fontSize={22} fontWeight={600} textAnchor="middle"
        fill={theme.palette.text.primary} style={{ fontVariantNumeric: 'tabular-nums' }}>
        —
      </text>
      <text x={CX} y={CY + 45} fontSize={9} textAnchor="middle" fill={theme.palette.text.secondary}>
        {label} ({unit})
      </text>
    </svg>
  )
}
