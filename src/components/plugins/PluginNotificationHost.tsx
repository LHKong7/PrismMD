import { useEffect } from 'react'
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react'
import { usePluginNotifications } from '../../lib/plugins/host'

const AUTO_DISMISS_MS = 4000

/**
 * Minimal toast stack for `PluginHost#notify`. Intentionally lightweight
 * — we don't pull in a toast library for v1 because plugins only need
 * transient feedback (e.g. "copied", "connected"). Plugins that want a
 * full UI can register a sidebar panel instead.
 */
export function PluginNotificationHost() {
  const items = usePluginNotifications((s) => s.notifications)
  const dismiss = usePluginNotifications((s) => s.dismiss)

  // Auto-dismiss after AUTO_DISMISS_MS so the stack doesn't accumulate
  // silently. Each notification has a unique id so the timer is keyed
  // to the specific entry, not the list.
  useEffect(() => {
    if (items.length === 0) return
    const timers = items.map((n) =>
      window.setTimeout(() => dismiss(n.id), AUTO_DISMISS_MS),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [items, dismiss])

  if (items.length === 0) return null

  return (
    <div
      className="fixed right-4 bottom-10 z-[60] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 320 }}
    >
      {items.map((n) => {
        const Icon =
          n.kind === 'success' ? CheckCircle2 : n.kind === 'error' ? AlertCircle : Info
        const tone =
          n.kind === 'success'
            ? 'text-green-500'
            : n.kind === 'error'
              ? 'text-red-500'
              : ''
        return (
          <div
            key={n.id}
            className="flex items-start gap-2 px-3 py-2 rounded-md shadow-lg border text-xs pointer-events-auto"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            <Icon size={14} className={`flex-shrink-0 mt-0.5 ${tone}`} />
            <span className="flex-1 break-words">{n.message}</span>
            <button
              onClick={() => dismiss(n.id)}
              className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
