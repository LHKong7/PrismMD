import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { appConfig } from '../app.config'
import { shutdown as shutdownInsightGraph } from './services/insightGraphService'
import { startAll as startMcpServers, shutdownAll as shutdownMcpServers } from './services/mcpService'
import { initAutoUpdater } from './services/updaterService'

// Apply app identity from the central config
app.setName(appConfig.name)

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function createWindow() {
  const iconPath = appConfig.icon
    ? path.join(
        app.isPackaged ? process.resourcesPath : app.getAppPath(),
        `${appConfig.icon}.${process.platform === 'win32' ? 'ico' : 'png'}`,
      )
    : undefined

  mainWindow = new BrowserWindow({
    title: appConfig.name,
    ...(iconPath ? { icon: iconPath } : {}),
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false)
  })
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  createWindow()
  // Fire MCP servers in the background — failures don't block window
  // creation, and individual server errors are logged inside the service.
  startMcpServers().catch((err) => console.warn('[mcp] startAll failed:', err))
  // Auto-updater: only active in packaged builds on mac/win; dev runs
  // and linux packages are skipped internally.
  initAutoUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let servicesShutdownStarted = false
app.on('before-quit', (event) => {
  if (servicesShutdownStarted) return
  servicesShutdownStarted = true
  event.preventDefault()
  // Tear down both long-running services in parallel so the user
  // isn't stuck waiting on one blocking the other on app close.
  Promise.all([
    shutdownInsightGraph().catch(() => {}),
    shutdownMcpServers().catch(() => {}),
  ]).finally(() => app.exit(0))
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
