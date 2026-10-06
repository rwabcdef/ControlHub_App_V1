import { Link, Outlet, useLocation } from 'react-router'
import { AppBar, Box, Chip, IconButton, Tab, Tabs, Toolbar, Tooltip, Typography } from '@mui/material'
import SpeedIcon from '@mui/icons-material/Speed'
import TuneIcon from '@mui/icons-material/Tune'
import FolderIcon from '@mui/icons-material/Folder'
import BuildIcon from '@mui/icons-material/Build'
import ListAltIcon from '@mui/icons-material/ListAlt'
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar'
import VerticalSplitIcon from '@mui/icons-material/VerticalSplit'
import { useComms } from '../state/comms'
import { useDisplay } from '../state/display'
import { ConnectionPanel } from './ConnectionPanel'
import { ControlPanel } from './ControlPanel'
import { StatusFooter } from './StatusFooter'

const NAV = [
  { to: '/', label: 'Dashboard', icon: <SpeedIcon fontSize="small" /> },
  { to: '/config', label: 'Config', icon: <TuneIcon fontSize="small" /> },
  { to: '/log', label: 'MQTT log', icon: <ListAltIcon fontSize="small" /> },
  { to: '/files', label: 'Files', icon: <FolderIcon fontSize="small" /> },
  { to: '/dev', label: 'Dev', icon: <BuildIcon fontSize="small" /> }
]

const STATUS_COLOR = { connected: 'success', connecting: 'info', error: 'error', disconnected: 'default' } as const

/**
 * App shell. CSS Grid handles the page skeleton (full height, fixed header/footer,
 * collapsible side columns); child routes render into the centre cell via <Outlet/>.
 * Inside pages, use MUI Grid/Stack for row/column content layout.
 */
export function MainLayout(): React.JSX.Element {
  const { pathname } = useLocation()
  const comms = useComms((s) => s.state)
  const { leftPanelOpen, rightPanelOpen, dashControlOpen, set } = useDisplay()
  const active = NAV.slice().reverse().find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'grid',
        gridTemplateAreas: `"header header header" "nav nav nav" "left main right" "footer footer footer"`,
        gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
        gridTemplateColumns: `${leftPanelOpen ? '240px' : '0px'} minmax(0, 1fr) ${rightPanelOpen ? '260px' : '0px'}`,
        bgcolor: 'background.default'
      }}
    >
      {/* Header */}
      <AppBar position="static" color="default" elevation={0} sx={{ gridArea: 'header', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Tooltip title="Toggle connection panel">
            <IconButton size="small" onClick={() => set({ leftPanelOpen: !leftPanelOpen })}>
              <ViewSidebarIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
            </IconButton>
          </Tooltip>
          {active?.to === '/' && (
            <Tooltip title="Toggle Control panel">
              <IconButton size="small" color={dashControlOpen ? 'primary' : 'default'}
                onClick={() => set({ dashControlOpen: !dashControlOpen })}>
                <VerticalSplitIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600 }}>
            ControlHub <Typography component="span" color="text.secondary">AA26</Typography>
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Chip size="small" variant="outlined" color={STATUS_COLOR[comms.status]}
            label={`${comms.kind.toUpperCase()} · ${comms.status}`} />
          <Tooltip title="Toggle motor control panel">
            <IconButton size="small" onClick={() => set({ rightPanelOpen: !rightPanelOpen })}>
              <ViewSidebarIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Main nav bar */}
      <Box component="nav" sx={{ gridArea: 'nav', borderBottom: 1, borderColor: 'divider', px: 1 }}>
        <Tabs value={active?.to ?? false} sx={{ minHeight: 40 }}>
          {NAV.map((n) => (
            <Tab key={n.to} value={n.to} label={n.label} icon={n.icon} iconPosition="start"
              component={Link} to={n.to} sx={{ minHeight: 40, py: 0 }} />
          ))}
        </Tabs>
      </Box>

      {/* Left column */}
      <Box component="aside" sx={{ gridArea: 'left', overflow: 'auto', borderRight: leftPanelOpen ? 1 : 0, borderColor: 'divider' }}>
        {leftPanelOpen && <ConnectionPanel />}
      </Box>

      {/* Main content: child routes render here */}
      <Box component="main" sx={{ gridArea: 'main', overflow: 'auto', p: 1.5, minWidth: 0 }}>
        <Outlet />
      </Box>

      {/* Right column */}
      <Box component="aside" sx={{ gridArea: 'right', overflow: 'auto', borderLeft: rightPanelOpen ? 1 : 0, borderColor: 'divider' }}>
        {rightPanelOpen && <ControlPanel />}
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ gridArea: 'footer', borderTop: 1, borderColor: 'divider' }}>
        <StatusFooter />
      </Box>
    </Box>
  )
}
