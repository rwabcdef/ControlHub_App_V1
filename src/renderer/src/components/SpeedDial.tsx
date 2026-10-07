import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@mui/material/styles'

interface SpeedDialProps {
  /** What the hub holds; null until known */
  value: number | null
  min?: number
  max: number
  label: string
  unit: string
  color: string
  disabled?: boolean
  /** Called as the dial turns, with whole numbers in min..max */
  onChange: (value: number) => void
  /** A new object here (a failed set) drops the dial's own value and shows `value` again */
  error?: object | null
  majorTicks?: number
}

// The Gauge's geometry, so the dial reads as one of the dashboard's gauges.
const CX = 100
const CY = 100
const R = 80
const START = 150 // degrees, clockwise from +x (lower-left)
const SWEEP = 240
const VIEW = { x: 0, y: 12, w: 200, h: 150 }
/** Presses nearer the centre than this (the readout, the hub) don't grab the dial */
const GRAB_RADIUS = R - 30

const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}
const arc = (r: number, a0: number, a1: number): string => {
  const [x0, y0] = polar(r, a0)
  const [x1, y1] = polar(r, a1)
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}
const fmtTick = (v: number): string => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)

/**
 * A rotary knob for a setpoint: drag the pointer round, scroll, or use the
 * arrow keys (PageUp / PageDown for 10). While it is being turned it shows
 * its own value; once the hub's value catches up (or a set fails) it shows
 * the hub's again, so it never claims a speed the hub did not take.
 */
export function SpeedDial(props: SpeedDialProps): React.JSX.Element {
  const { value, min = 0, max, label, unit, color, disabled = false, onChange, error, majorTicks = 6 } = props
  const theme = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const [local, setLocal] = useState<number | null>(null)

  // Hand back to the hub's value once it agrees, the set failed, or the dial is disabled.
  useEffect(() => {
    if (!dragging.current && local !== null && value === local) setLocal(null)
  }, [value, local])
  useEffect(() => {
    if (error) setLocal(null)
  }, [error])
  useEffect(() => {
    if (disabled) {
      dragging.current = false
      setLocal(null)
    }
  }, [disabled])

  const shown = local ?? value
  const clamp = (v: number): number => Math.min(max, Math.max(min, Math.round(v)))
  const frac = (v: number): number => (max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0)
  const f = shown === null ? 0 : frac(shown)

  const set = (v: number): void => {
    const next = clamp(v)
    if (next === (local ?? value)) return
    setLocal(next)
    onChange(next)
  }

  /**
   * The value at a pointer position, as a fraction of the scale: rel is the
   * angle past START, dist the distance from the centre (viewBox units).
   */
  const pointAt = (clientX: number, clientY: number): { rel: number; dist: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    // viewBox with the default xMidYMid meet: uniform scale, centred
    const scale = Math.min(r.width / VIEW.w, r.height / VIEW.h)
    if (!(scale > 0)) return null
    const x = (clientX - r.left - (r.width - VIEW.w * scale) / 2) / scale + VIEW.x
    const y = (clientY - r.top - (r.height - VIEW.h * scale) / 2) / scale + VIEW.y
    const deg = (Math.atan2(y - CY, x - CX) * 180) / Math.PI
    return { rel: (((deg - START) % 360) + 360) % 360, dist: Math.hypot(x - CX, y - CY) }
  }
  /** While dragging, the gap at the bottom snaps to the nearer end. */
  const valueOf = (rel: number): number => {
    const t = rel <= SWEEP ? rel / SWEEP : rel - SWEEP < 360 - rel ? 1 : 0
    return min + t * (max - min)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (disabled || e.button !== 0) return
    e.currentTarget.focus()
    // Only a press on the scale itself sets a value - a click on the readout
    // or the centre, or in the gap, must not step a running motor to an end.
    const p = pointAt(e.clientX, e.clientY)
    if (!p || p.dist < GRAB_RADIUS || p.rel > SWEEP) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    set(valueOf(p.rel))
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (!dragging.current) return
    const p = pointAt(e.clientX, e.clientY)
    if (p) set(valueOf(p.rel))
  }
  const endDrag = (): void => {
    dragging.current = false
    // The hub may already agree - the effect only runs when value or local changes.
    if (local !== null && value === local) setLocal(null)
  }

  // From outside the scale (a target set elsewhere above the dial's max), a
  // step only ever moves towards it - ArrowUp must never cut the speed.
  const step = (d: number): void => {
    const cur = shown ?? min
    if ((cur > max && d > 0) || (cur < min && d < 0)) return
    set(cur + d)
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (disabled) return
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key]
    if (d !== undefined) step(d)
    else if (e.key === 'Home') set(min)
    else if (e.key === 'End') set(max)
    else return
    e.preventDefault()
  }

  // A native listener: React's onWheel is passive, so it can't stop the page scrolling.
  const wheel = useRef<(e: WheelEvent) => void>(() => {})
  wheel.current = (e) => {
    if (disabled || e.deltaY === 0) return
    e.preventDefault()
    step(e.deltaY < 0 ? 1 : -1)
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const h = (e: WheelEvent): void => wheel.current(e)
    svg.addEventListener('wheel', h, { passive: false })
    return () => svg.removeEventListener('wheel', h)
  }, [])

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

  const ink = disabled ? theme.palette.action.disabled : color
  const angle = START + f * SWEEP
  const [kx, ky] = polar(R + 6, angle)

  return (
    <svg ref={svgRef} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} width="100%" height="100%"
      role="slider" aria-label={label} aria-valuemin={min} aria-valuemax={max}
      aria-valuenow={shown ?? undefined} aria-valuetext={shown === null ? 'unknown' : `${shown} ${unit}`}
      aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag}
      onPointerCancel={endDrag} onKeyDown={onKeyDown}
      style={{ cursor: disabled ? 'default' : 'pointer', touchAction: 'none', outline: 'none', userSelect: 'none' }}>
      <path d={arc(R + 6, START, START + SWEEP)} stroke={theme.palette.action.hover} strokeWidth={6} fill="none" />
      <path d={arc(R + 6, START, START + SWEEP)} stroke={ink} strokeWidth={6} fill="none"
        pathLength={1000} strokeDasharray={`${f * 1000} 1000`} />
      {ticks}
      <g transform={`rotate(${angle} ${CX} ${CY})`}>
        <line x1={CX} y1={CY} x2={CX + R - 6} y2={CY} stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
      </g>
      {shown !== null && (
        <circle cx={kx} cy={ky} r={7} fill={theme.palette.background.paper} stroke={ink} strokeWidth={2.5} />
      )}
      <circle cx={CX} cy={CY} r={5} fill={theme.palette.background.paper} stroke={ink} strokeWidth={2} />
      <text x={CX} y={CY + 30} fontSize={22} fontWeight={600} textAnchor="middle"
        fill={disabled ? theme.palette.text.disabled : theme.palette.text.primary}
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {shown ?? '—'}
      </text>
      <text x={CX} y={CY + 45} fontSize={9} textAnchor="middle" fill={theme.palette.text.secondary}>
        {label} ({unit})
      </text>
    </svg>
  )
}
