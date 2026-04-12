import { registerFileHandlers } from './fileHandlers'
import { registerThemeHandlers } from './themeHandlers'
import { registerAnnotationHandlers } from './annotationHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerAgentHandlers } from './agentHandlers'
import { getMainWindow } from '../main'

/**
 * Lazily resolve the current main window. Handlers that send events to the
 * renderer should call this each time rather than capturing the window
 * reference at registration time, since windows can be recreated on macOS
 * after all windows are closed.
 */
export { getMainWindow }

export function registerIpcHandlers() {
  registerFileHandlers()
  registerThemeHandlers()
  registerAnnotationHandlers()
  registerSettingsHandlers()
  registerAgentHandlers()
}
