import { Paper, Typography, type SxProps, type Theme } from '@mui/material'

interface PanelProps {
  title?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  sx?: SxProps<Theme>
}

/**
 * Titled card whose body stretches to fill the panel. Place it inside a sized
 * flex/grid cell and its children get the remaining height (flex: 1, minHeight: 0).
 */
export function Panel({ title, action, children, sx }: PanelProps): React.JSX.Element {
  return (
    <Paper
      variant="outlined"
      sx={[{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, p: 1.5 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }} color="text.secondary">
            {title}
          </Typography>
          {action}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </Paper>
  )
}
