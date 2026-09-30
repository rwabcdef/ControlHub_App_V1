import { createHashRouter, Navigate } from 'react-router'
import { MainLayout } from './layouts/MainLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ConfigLayout } from './pages/config/ConfigLayout'
import { CommsConfigPage } from './pages/config/CommsConfigPage'
import { DisplayConfigPage } from './pages/config/DisplayConfigPage'
import { DevPage } from './pages/DevPage'
import { FilesPage } from './pages/FilesPage'

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
          { path: 'display', element: <DisplayConfigPage /> }
        ]
      },
      { path: 'files', element: <FilesPage /> },
      { path: 'dev', element: <DevPage /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
])
