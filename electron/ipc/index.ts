import { registerThemeHandlers } from './themeHandlers'
import { registerAnnotationHandlers } from './annotationHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerAgentHandlers } from './agentHandlers'
import { registerInsightGraphHandlers } from './insightGraphHandlers'
import { registerPluginHandlers } from './pluginHandlers'
import { registerMcpHandlers } from './mcpHandlers'
import { registerUpdaterHandlers } from './updaterHandlers'
import { registerExportHandlers } from './exportHandlers'
import { registerKnowledgeBaseHandlers } from './knowledgeBaseHandlers'
import { registerWorkspaceHandlers } from './workspaceHandlers'
import { registerLibraryHandlers } from './libraryHandlers'
import { registerDataLocationHandlers } from './dataLocationHandlers'
import { registerVersionHandlers } from './versionHandlers'
import { registerFrontStageHandlers } from './frontStageHandlers'
import { getMainWindow } from '../main'
/**
 * Lazily resolve the current main window. Handlers that send events to the
 * renderer should call this each time rather than capturing the window
 * reference at registration time, since windows can be recreated on macOS
 * after all windows are closed.
 */
export { getMainWindow }

export function registerIpcHandlers() {
  registerThemeHandlers()
  registerAnnotationHandlers()
  registerSettingsHandlers()
  registerAgentHandlers()
  registerInsightGraphHandlers()
  registerPluginHandlers()
  registerMcpHandlers()
  registerUpdaterHandlers()
  registerExportHandlers()
  registerKnowledgeBaseHandlers()
  registerWorkspaceHandlers()
  registerLibraryHandlers()
  registerDataLocationHandlers()
  registerVersionHandlers()
  registerFrontStageHandlers()
}
