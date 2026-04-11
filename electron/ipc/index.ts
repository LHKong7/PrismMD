import { BrowserWindow } from 'electron'
import { registerFileHandlers } from './fileHandlers'
import { registerThemeHandlers } from './themeHandlers'
import { registerAnnotationHandlers } from './annotationHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerAgentHandlers } from './agentHandlers'

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  registerFileHandlers(mainWindow)
  registerThemeHandlers(mainWindow)
  registerAnnotationHandlers()
  registerSettingsHandlers()
  registerAgentHandlers(mainWindow)
}
