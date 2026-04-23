import { AlertCircle } from 'lucide-react'

export type ErrorSeverity = 'warning' | 'error'

interface ErrorBannerProps {
  severity?: ErrorSeverity
  title?: string
  message: string
  /** When true (default for `error`), centers the banner like a full-page state. */
  fullPage?: boolean
}

/**
 * Shared inline error/warning banner. Two layouts:
 *  - inline strip (default for `warning`): mirrors the CSV parse-warning row
 *  - centered card (default for `error`): used in viewer-failure states
 */
export function ErrorBanner({
  severity = 'error',
  title,
  message,
  fullPage,
}: ErrorBannerProps) {
  const isError = severity === 'error'
  const iconColor = isError ? 'text-error' : 'text-warning'
  const isFullPage = fullPage ?? isError

  if (!isFullPage) {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2 text-xs border-b"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
        role={isError ? 'alert' : 'status'}
      >
        <AlertCircle size={12} className={`flex-shrink-0 mt-0.5 ${iconColor}`} />
        <span>
          {title && <strong className="mr-1" style={{ color: 'var(--text-primary)' }}>{title}</strong>}
          {message}
        </span>
      </div>
    )
  }

  return (
    <div
      className="h-full flex items-center justify-center p-8 text-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
      role={isError ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-2 max-w-sm text-left">
        <AlertCircle size={14} className={`flex-shrink-0 mt-0.5 ${iconColor}`} />
        <div>
          {title && (
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
          )}
          <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
