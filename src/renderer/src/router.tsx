import { createHashRouter, Navigate } from 'react-router'
import { MainLayout } from './layouts/MainLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ConfigLayout } from './pages/config/ConfigLayout'
import { CommsConfigPage } from './pages/config/CommsConfigPage'
import { ControlHubConfigPage } from './pages/config/ControlHubConfigPage'
import { DisplayConfigPage } from './pages/config/DisplayConfigPage'
import { DevPage } from './pages/DevPage'
import { FilesPage } from './pages/FilesPage'
import { LogPage } from './pages/LogPage'

// Hash routing works with both the dev server and file:// in packaged builds.
export const router = createHashRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'config',
        element: <ConfigLayout />,
        children: [
          { index: true, element: <Navigate to="comms" replace /> },
          { path: 'comms', element: <CommsConfigPage /> },
          { path: 'controlhub', element: <ControlHubConfigPage /> },
          { path: 'display', element: <DisplayConfigPage /> }
        ]
      },
      { path: 'log', element: <LogPage /> },
      { path: 'files', element: <FilesPage /> },
      { path: 'dev', element: <DevPage /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
])
