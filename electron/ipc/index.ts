import { BrowserWindow } from 'electron'
import { registerFileHandlers } from './fileHandlers'
import { registerThemeHandlers } from './themeHandlers'
import { registerAnnotationHandlers } from './annotationHandlers'

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  registerFileHandlers(mainWindow)
  registerThemeHandlers(mainWindow)
  registerAnnotationHandlers()
}
