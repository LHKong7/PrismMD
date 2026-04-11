import { useAgentStore } from '../../store/agentStore'
import { useSettingsStore } from '../../store/settingsStore'

/**
 * Focus Mode overlay: dims the background document when the Agent sidebar
 * is open and actively streaming, drawing attention to the AI response.
 */
export function FocusOverlay() {
  const agentSidebarOpen = useAgentStore((s) => s.agentSidebarOpen)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const focusMode = useSettingsStore((s) => s.focusMode)

  // Only show overlay when agent is open AND actively streaming AND focus mode is enabled
  const shouldShow = agentSidebarOpen && isStreaming && focusMode

  if (!shouldShow) return null

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none transition-opacity duration-500"
      style={{
        backgroundColor: 'var(--bg-primary)',
        opacity: 0.4,
      }}
    />
  )
}
