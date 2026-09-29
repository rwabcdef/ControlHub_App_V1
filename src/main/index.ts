import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { commsHub, registerCommsIpc } from './comms/hub'
import { registerFsIpc } from './fsAccess'

function createWindow(): void {
  nativeTheme.themeSource = 'dark' // dark native scrollbars, dialogs and title bar
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0e1116',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // keep plots updating when the window is behind another one
      backgroundThrottling: false
    }
  })

  win.once('ready-to-show', () => {
    win.show()
    // Dev: DevTools in its own window, so the app layout keeps its full width.
    if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })
  })

  // Open external links in the OS browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  commsHub.attach(win.webContents)

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerCommsIpc()
  registerFsIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void commsHub.disconnect().finally(() => {
    if (process.platform !== 'darwin') app.quit()
  })
})
