import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { theme } from './theme'
import { router } from './router'
// Subscribes at startup, so the MQTT log page shows traffic from before it was opened.
import './state/mqttLog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
)
