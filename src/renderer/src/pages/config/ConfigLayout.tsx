import { Link, Outlet, useLocation } from 'react-router'
import { Box, Tab, Tabs } from '@mui/material'

const TABS = [
  { to: '/config/comms', label: 'Communications' },
  { to: '/config/controlhub', label: 'ControlHub' },
  { to: '/config/display', label: 'Display' }
]

/** Nested layout: config sub-pages render into this <Outlet/>. */
export function ConfigLayout(): React.JSX.Element {
  const { pathname } = useLocation()
  const active = TABS.find((t) => pathname.startsWith(t.to))?.to ?? false

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Tabs value={active} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((t) => (
          <Tab key={t.to} value={t.to} label={t.label} component={Link} to={t.to} />
        ))}
      </Tabs>
      <Outlet />
    </Box>
  )
}
