import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'

/**
 * Presentational toast container + item. Does NOT own state — callers
 * provide `items` and `onDismiss`. This keeps us from introducing a new
 * global store when PluginNotificationHost already has one.
 *
 * Designed so PluginNotificationHost can migrate to this host without
 * changing its own notification model; new surfaces (e.g. save confirmations)
 * can build their own small store and reuse this container.
 */
export type ToastTone = 'info' | 'success' | 'error' | 'warning'

export interface ToastItem {
  id: string
  tone?: ToastTone
  message: ReactNode
  /** Optional header/title rendered above the message. */
  title?: ReactNode
}

const TONE_ICON = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertCircle,
} as const

const TONE_TEXT: Record<ToastTone, string> = {
  info: 'text-info',
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
}

export function ToastHost({
  items,
  onDismiss,
  className,
}: {
  items: ToastItem[]
  onDismiss: (id: string) => void
  className?: string
}) {
  return createPortal(
    <div
      className={clsx(
        'fixed right-4 bottom-10 z-toast flex flex-col gap-2 pointer-events-none',
        className,
      )}
      style={{ maxWidth: 320 }}
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const tone = t.tone ?? 'info'
        const Icon = TONE_ICON[tone]
        return (
          <div
            key={t.id}
            role={tone === 'error' ? 'alert' : 'status'}
            className="flex items-start gap-2 px-3 py-2 rounded-md shadow-md border text-xs pointer-events-auto"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            <Icon size={14} className={clsx('flex-shrink-0 mt-0.5', TONE_TEXT[tone])} />
            <div className="flex-1 min-w-0 break-words">
              {t.title && (
                <div className="font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
                  {t.title}
                </div>
              )}
              <div>{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Dismiss"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
