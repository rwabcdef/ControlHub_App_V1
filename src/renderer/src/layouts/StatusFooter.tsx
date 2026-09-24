import { useEffect, useState } from 'react'
import { Stack, Typography } from '@mui/material'
import { telemetry } from '../telemetry/store'

/** Footer: low-rate status readout (polled at 2 Hz, so plain React state is fine). */
export function StatusFooter(): React.JSX.Element {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <Stack direction="row" spacing={3} sx={{ px: 1.5, py: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        Rate: {telemetry.rate.toFixed(0)} Hz
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Buffered: {telemetry.t.length.toLocaleString()} samples
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'right' }}>
        {window.api.platform}
      </Typography>
    </Stack>
  )
}
