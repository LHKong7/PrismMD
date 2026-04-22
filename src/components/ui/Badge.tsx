import type { ReactNode } from 'react'
import { clsx } from 'clsx'

/**
 * Small status pill. Used for "LOCAL" provider badges, unread counts, and
 * error counters that were previously rendered with ad-hoc spans in
 * AgentSidebar / LeftSidebar / SettingsPanel.
 *
 * `tone` maps to semantic color tokens so it tracks the active theme.
 */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral:
    'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  accent:
    'bg-[color-mix(in_srgb,var(--accent-color)_15%,transparent)] text-[var(--accent-color)]',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-error-bg text-error',
  info: 'bg-info-bg text-info',
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
