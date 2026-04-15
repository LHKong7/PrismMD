import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { clsx } from 'clsx'

/**
 * Shared button primitive. Consolidates the half-dozen bespoke button
 * styles scattered across the app (TitleBar icons, Settings tabs,
 * Agent CTAs, etc.) into three `variant`s and two `size`s.
 *
 * Design notes:
 * - `ghost` is the most common — transparent background with a subtle
 *   hover wash. Used for icon-only toolbar buttons.
 * - `primary` is the accent-colored call-to-action (Send, Configure AI).
 * - `danger` is for destructive / retry-error affordances.
 * - `outline` keeps the Welcome-screen "secondary CTA" feel (bordered
 *   with transparent background).
 *
 * We always apply `focus-visible` ring so keyboard nav is obvious — this
 * matches the global rule in `styles/index.css` but pinning it at the
 * component level means we can't accidentally lose it by overriding
 * `outline` in a per-instance className.
 */
export type ButtonVariant = 'ghost' | 'primary' | 'danger' | 'outline'
export type ButtonSize = 'icon' | 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  ghost:
    'bg-transparent hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)]',
  primary: '', // bg set inline via var(--accent-color) for theme awareness
  danger: 'border border-red-500 text-red-500 bg-red-500/10 hover:bg-red-500/20',
  outline:
    'border border-[var(--border-color)] text-[var(--text-secondary)] bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  icon: 'p-1 rounded',
  sm: 'px-2 py-1 rounded text-xs',
  md: 'px-3 py-1.5 rounded-md text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'sm', className, style, children, type, ...rest },
  ref,
) {
  const isPrimary = variant === 'primary'
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 transition-colors',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
      style={
        isPrimary
          ? { backgroundColor: 'var(--accent-color)', color: '#fff', ...style }
          : style
      }
      {...rest}
    >
      {children}
    </button>
  )
})
