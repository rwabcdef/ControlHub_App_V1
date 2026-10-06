import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import type { MqttLogLine } from '@shared/types'
import { Panel } from '../components/Panel'
import { mqttLog, useMqttLog } from '../state/mqttLog'

/** Lines rendered at once - the newest. The store keeps more. */
const SHOWN = 500

const time = (t: number): string => new Date(t).toISOString().slice(11, 23)

/**
 * Every line of MQTT traffic between this app and the hub, both ways:
 * frames, acks and status. Collected from app start (state/mqttLog.ts), so
 * this page also shows what came before it was opened. Pause freezes the
 * view; lines are still collected meanwhile.
 */
export function LogPage(): React.JSX.Element {
  const lines = useMqttLog()
  const [filter, setFilter] = useState('')
  const [paused, setPaused] = useState(false)
  const [follow, setFollow] = useState(true)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mqttLog.setPaused(paused)
    return () => mqttLog.setPaused(false)
  }, [paused])

  const shown = useMemo(() => {
    const f = filter.trim().toUpperCase()
    const matching = f ? lines.filter((l) => l.line.toUpperCase().includes(f)) : lines
    return matching.slice(-SHOWN)
  }, [lines, filter])

  useEffect(() => {
    if (follow) bottom.current?.scrollIntoView({ block: 'end' })
  }, [shown, follow])

  return (
    <Panel
      title={`MQTT traffic (${lines.length} lines)`}
      sx={{ height: '100%' }}
      action={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField size="small" placeholder="Filter, e.g. CTRL0" value={filter}
            onChange={(e) => setFilter(e.target.value)} sx={{ width: 200 }} />
          <FormControlLabel label="Pause" control={
            <Switch size="small" checked={paused} onChange={(e) => setPaused(e.target.checked)} />} />
          <FormControlLabel label="Follow" control={
            <Switch size="small" checked={follow} onChange={(e) => setFollow(e.target.checked)} />} />
          <Button size="small" startIcon={<ClearAllIcon />} onClick={() => mqttLog.clear()}>Clear</Button>
        </Stack>
      }
    >
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', fontFamily: 'monospace', fontSize: 13 }}>
        {shown.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Nothing yet - MQTT traffic shows here once connected over MQTT.
          </Typography>
        )}
        {shown.map((l, i) => <LogRow key={`${l.t}-${i}`} line={l} />)}
        <div ref={bottom} />
      </Box>
    </Panel>
  )
}

function LogRow({ line }: { line: MqttLogLine }): React.JSX.Element {
  const out = line.dir === 'out'
  return (
    <Box sx={{ display: 'flex', gap: 1.5, whiteSpace: 'pre' }}>
      <Box component="span" sx={{ color: 'text.secondary' }}>{time(line.t)}</Box>
      <Box component="span" sx={{ color: out ? 'success.main' : 'info.main', width: 40 }}>
        {out ? 'out' : 'in'}
      </Box>
      <Box component="span">{line.line}</Box>
    </Box>
  )
}
