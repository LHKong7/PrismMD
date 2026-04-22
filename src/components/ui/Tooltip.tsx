import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Lightweight tooltip. Shows on hover AND keyboard focus — unlike the native
 * `title` attribute we were using everywhere, this means keyboard users
 * actually see the hint.
 *
 * Positioning is post-mount: we measure the trigger after render and flip
 * above/below based on available space. Good enough for icon buttons; not
 * intended as a full Floating UI replacement.
 */
export interface TooltipProps {
  label: ReactNode
  /** Delay before showing, in ms. Prevents flicker when passing over icons. */
  openDelay?: number
  /** Preferred side; falls back to the opposite if there's not enough room. */
  side?: 'top' | 'bottom'
  children: ReactElement
}

export function Tooltip({ label, openDelay = 400, side = 'top', children }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: side,
  })
  const triggerRef = useRef<HTMLElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const id = useId()

  const show = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setOpen(true), openDelay)
  }
  const hide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setOpen(false)
  }

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  // Close tooltip on Escape for keyboard users who want to dismiss it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const tt = tooltipRef.current.getBoundingClientRect()
    const margin = 6
    const preferTop = side === 'top'
    const topRoom = tr.top - tt.height - margin
    const bottomRoom = window.innerHeight - tr.bottom - tt.height - margin
    const placement: 'top' | 'bottom' = preferTop
      ? topRoom > 0 || topRoom >= bottomRoom
        ? 'top'
        : 'bottom'
      : bottomRoom > 0 || bottomRoom >= topRoom
        ? 'bottom'
        : 'top'
    const top =
      placement === 'top' ? tr.top - tt.height - margin : tr.bottom + margin
    const left = Math.max(
      4,
      Math.min(window.innerWidth - tt.width - 4, tr.left + tr.width / 2 - tt.width / 2),
    )
    setCoords({ top, left, placement })
  }, [open, side])

  if (!isValidElement(children)) return children

  // Type the element loosely — we only need to forward ref + a few handlers,
  // and the child is always a host element in practice.
  type TriggerProps = {
    ref?: (node: HTMLElement | null) => void
    'aria-describedby'?: string
    onMouseEnter?: (e: React.MouseEvent) => void
    onMouseLeave?: (e: React.MouseEvent) => void
    onFocus?: (e: React.FocusEvent) => void
    onBlur?: (e: React.FocusEvent) => void
  }
  const child = children as ReactElement<TriggerProps>

  const cloned = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      // Forward to the original ref if any (works for string-less refs).
      const { ref } = child as unknown as { ref?: unknown }
      if (typeof ref === 'function') ref(node)
      else if (ref && typeof ref === 'object' && 'current' in (ref as object)) {
        ;(ref as { current: HTMLElement | null }).current = node
      }
    },
    'aria-describedby': open ? id : child.props['aria-describedby'],
    onMouseEnter: (e: React.MouseEvent) => {
      show()
      child.props.onMouseEnter?.(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide()
      child.props.onMouseLeave?.(e)
    },
    onFocus: (e: React.FocusEvent) => {
      show()
      child.props.onFocus?.(e)
    },
    onBlur: (e: React.FocusEvent) => {
      hide()
      child.props.onBlur?.(e)
    },
  })

  return (
    <>
      {cloned}
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-tooltip px-2 py-1 rounded text-xs shadow-md max-w-xs prism-fade-in"
            style={{
              top: coords.top,
              left: coords.left,
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  )
}
