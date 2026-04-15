import { Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

/**
 * Canonical loading spinner. Unifies the mix of `<Loader2 animate-spin />`
 * and `animate-pulse` <Bot> / <Brain> icons that previously varied per
 * component. Keeping one spin cadence across the app makes the loading
 * rhythm feel consistent.
 *
 * Prefer this over inline `<Loader2 className="animate-spin" />` for any
 * new UI. Existing `animate-pulse` skeletons stay as-is — they're a
 * different semantic (placeholder content) not a spinner.
 */
export interface SpinnerProps {
  size?: number
  className?: string
  /** Accessible label for screen readers. */
  label?: string
}

export function Spinner({ size = 14, className, label }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={clsx('animate-spin', className)}
      style={{ color: 'var(--text-muted)' }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
