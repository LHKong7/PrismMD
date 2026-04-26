import { useCallback, useRef } from 'react'
import type { SplitDirection } from '../../store/uiStore'

interface SplitDividerProps {
  direction: SplitDirection
  onRatioChange: (ratio: number) => void
  onRatioChangeEnd?: () => void
}

/**
 * Draggable divider between two split panes. Operates on a 0–1 ratio
 * rather than absolute pixel widths. Reuses the same mouse-capture
 * pattern as ResizeHandle.
 */
export function SplitDivider({ direction, onRatioChange, onRatioChangeEnd }: SplitDividerProps) {
  const dragging = useRef(false)
  const startPos = useRef(0)
  const startRatio = useRef(0)
  const containerSize = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true

      const container = (e.currentTarget as HTMLElement).parentElement
      if (!container) return

      if (direction === 'horizontal') {
        startPos.current = e.clientX
        containerSize.current = container.offsetWidth
      } else {
        startPos.current = e.clientY
        containerSize.current = container.offsetHeight
      }

      // Read current ratio from the first pane's size.
      const firstPane = container.children[0] as HTMLElement | undefined
      if (firstPane && containerSize.current > 0) {
        const size = direction === 'horizontal' ? firstPane.offsetWidth : firstPane.offsetHeight
        startRatio.current = size / containerSize.current
      }

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current || containerSize.current === 0) return
        const delta = direction === 'horizontal'
          ? ev.clientX - startPos.current
          : ev.clientY - startPos.current
        const ratioDelta = delta / containerSize.current
        const next = Math.max(0.2, Math.min(0.8, startRatio.current + ratioDelta))
        onRatioChange(next)
      }

      const onMouseUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        onRatioChangeEnd?.()
      }

      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [direction, onRatioChange, onRatioChangeEnd],
  )

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      onMouseDown={handleMouseDown}
      className="relative z-10 shrink-0 opacity-0 hover:opacity-100 transition-opacity duration-150"
      style={{
        width: isHorizontal ? 4 : '100%',
        height: isHorizontal ? '100%' : 4,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        backgroundColor: 'var(--accent-primary)',
      }}
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
    />
  )
}
