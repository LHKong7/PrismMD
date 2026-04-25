import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  /** Which sidebar this handle controls. */
  side: 'left' | 'right' | 'agent'
  /** Current width in pixels. */
  currentWidth: number
  /** Called on every mousemove during drag with the new width. */
  onResize: (width: number) => void
  /** Called once on mouseup — useful for persisting the final value. */
  onResizeEnd?: () => void
}

const MIN_WIDTH = 160
const MAX_WIDTH = 500

export function ResizeHandle({ side, currentWidth, onResize, onResizeEnd }: ResizeHandleProps) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      startX.current = e.clientX
      startWidth.current = currentWidth

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const delta = side === 'left'
          ? ev.clientX - startX.current
          : startX.current - ev.clientX
        const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta))
        onResize(next)
      }

      const onMouseUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        onResizeEnd?.()
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [side, currentWidth, onResize, onResizeEnd],
  )

  // Position: at the right edge of a left sidebar, or left edge of a right sidebar.
  const positionStyle: React.CSSProperties =
    side === 'left'
      ? { right: -2, top: 0, bottom: 0 }
      : { left: -2, top: 0, bottom: 0 }

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute z-overlay opacity-0 hover:opacity-100 transition-opacity duration-150"
      style={{
        ...positionStyle,
        width: 4,
        cursor: 'col-resize',
        backgroundColor: 'var(--accent-primary)',
      }}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={currentWidth}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
    />
  )
}
