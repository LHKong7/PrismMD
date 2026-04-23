import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * Shared modal shell. Consolidates the fixed-inset backdrop + focus-trap +
 * Esc-to-close boilerplate that was duplicated between SettingsPanel,
 * CommandPalette, and future modal surfaces.
 *
 * Not every existing modal has been migrated yet — new modals should use
 * this, and existing ones can be switched over incrementally.
 *
 * Accessibility:
 * - `role="dialog"` + `aria-modal="true"` + `aria-label` are always on.
 * - Esc closes (matches WCAG 2.1 Dialog Role pattern).
 * - Focus is trapped while open and restored on close by `useFocusTrap`.
 */
export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Visible-to-a11y label. Required — pass the same string you'd put in a title. */
  ariaLabel: string
  /** Optional visible title rendered in a standard header bar. */
  title?: ReactNode
  /** Custom max-width. Defaults to 32rem (`max-w-lg`). */
  widthClass?: string
  /** Whether clicking the backdrop closes the dialog. Default: true. */
  closeOnBackdrop?: boolean
  children: ReactNode
  /** Optional extra classes for the content panel (not the backdrop). */
  panelClassName?: string
}

export function Dialog({
  open,
  onClose,
  ariaLabel,
  title,
  widthClass = 'max-w-lg',
  closeOnBackdrop = true,
  children,
  panelClassName,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center prism-fade-in"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={ref}
        className={clsx(
          'relative w-full rounded-xl overflow-hidden shadow-xl border flex flex-col prism-fade-scale-in',
          widthClass,
          panelClassName,
        )}
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {title && (
          <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <h2
              className="text-base font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
