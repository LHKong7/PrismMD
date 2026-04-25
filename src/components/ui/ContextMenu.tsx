import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'

/**
 * Right-click / long-press context menu shell. Handles positioning,
 * outside-click, and Escape-to-close; the caller provides `items` or a
 * raw `children` render for heterogenous menus (like FileTreeNode's).
 *
 * Keyboard support: we add ArrowUp/ArrowDown/Home/End navigation over the
 * items by querying `[role=menuitem]` descendants — works whether callers
 * use `items` or raw children, as long as their buttons carry the role.
 */
export interface ContextMenuItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Renders the item with semantic "destructive" coloring. */
  destructive?: boolean
}

export interface ContextMenuProps {
  open: boolean
  /** Viewport-space anchor coords (typically from a MouseEvent). */
  x: number
  y: number
  onClose: () => void
  ariaLabel?: string
  /** Either provide structured items, or pass raw `children`. */
  items?: ContextMenuItem[]
  children?: ReactNode
  /** Min-width of the menu panel. Defaults to 200. */
  minWidth?: number
}

export function ContextMenu({
  open,
  x,
  y,
  onClose,
  ariaLabel,
  items,
  children,
  minWidth = 200,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape. Use `mousedown` so we close before any
  // click inside the same tick steals the event.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Arrow-key navigation among menuitems.
  useEffect(() => {
    if (!open || !ref.current) return
    const root = ref.current
    const focusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
        (el) => !el.hasAttribute('aria-disabled'),
      )
    const onKey = (e: KeyboardEvent) => {
      const items = focusable()
      if (items.length === 0) return
      const current = document.activeElement as HTMLElement | null
      const idx = current ? items.indexOf(current) : -1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        items[(idx + 1) % items.length].focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        items[(idx - 1 + items.length) % items.length].focus()
      } else if (e.key === 'Home') {
        e.preventDefault()
        items[0].focus()
      } else if (e.key === 'End') {
        e.preventDefault()
        items[items.length - 1].focus()
      }
    }
    root.addEventListener('keydown', onKey)
    // Auto-focus first item so keyboard users can start navigating.
    focusable()[0]?.focus()
    return () => root.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      ref={ref}
      className="fixed z-modal rounded-md border shadow-md py-1 text-xs prism-fade-scale-in"
      style={{
        left: x,
        top: y,
        minWidth,
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-secondary)',
      }}
      role="menu"
      aria-label={ariaLabel}
    >
      {children ??
        items?.map((item) => (
          <button
            key={item.id}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onSelect()
              onClose()
            }}
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
              'hover:bg-black/5 dark:hover:bg-white/5',
              'focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none',
              item.disabled && 'opacity-40 cursor-not-allowed',
              item.destructive && 'text-error',
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
    </div>,
    document.body,
  )
}
