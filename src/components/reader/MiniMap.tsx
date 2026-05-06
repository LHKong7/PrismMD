import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'
import type { CodeBlockMarker } from '../../lib/markdown/remarkCodeAnalysis'
import type { TocEntry } from '../../lib/markdown/remarkToc'

interface MarkerPosition {
  key: string
  percent: number
  color: string
  tooltip: string
  element: Element | null
}

interface Props {
  scrollRef: RefObject<HTMLDivElement | null>
  codeMarkers: CodeBlockMarker[]
  toc: TocEntry[]
}

const CODE_COLORS: Record<string, string> = {
  ok: '#9ca3af',
  broken: '#ef4444',
  empty: '#ef4444',
}

const HEADING_COLOR = '#3b82f6'

export function MiniMap({ scrollRef, codeMarkers, toc }: Props) {
  const [markers, setMarkers] = useState<MarkerPosition[]>([])
  const [viewportTop, setViewportTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)
  const tickingRef = useRef(false)

  // Compute marker positions from DOM
  const computePositions = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    const totalHeight = container.scrollHeight
    if (totalHeight <= 0) return

    const positions: MarkerPosition[] = []

    // Code block markers
    codeMarkers.forEach((m) => {
      const el = container.querySelector(`[data-code-block-index="${m.index}"]`)
      if (!el) return
      const offsetTop = (el as HTMLElement).offsetTop
      const percent = (offsetTop / totalHeight) * 100

      const langLabel = m.language || 'code'
      let tooltip = langLabel
      if (m.status === 'broken') tooltip = `Broken: ${langLabel}`
      else if (m.status === 'empty') tooltip = `Empty: ${langLabel}`

      positions.push({
        key: `code-${m.index}`,
        percent,
        color: CODE_COLORS[m.status],
        tooltip,
        element: el,
      })
    })

    // Heading markers from TOC (use rehype-slug ids)
    toc.forEach((entry, i) => {
      if (!entry.id) return
      const el = container.querySelector(`#${CSS.escape(entry.id)}`)
      if (!el) return
      const offsetTop = (el as HTMLElement).offsetTop
      const percent = (offsetTop / totalHeight) * 100

      positions.push({
        key: `heading-${i}`,
        percent,
        color: HEADING_COLOR,
        tooltip: entry.text,
        element: el,
      })
    })

    setMarkers(positions)
  }, [scrollRef, codeMarkers, toc])

  // Update viewport indicator on scroll
  const updateViewport = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    if (scrollHeight <= 0) return
    setViewportTop((scrollTop / scrollHeight) * 100)
    setViewportHeight((clientHeight / scrollHeight) * 100)
  }, [scrollRef])

  // Compute positions after DOM settles
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    // Initial computation after a short delay for DOM to settle
    const timer = setTimeout(() => {
      computePositions()
      updateViewport()
    }, 100)

    // Re-compute on resize
    const ro = new ResizeObserver(() => {
      computePositions()
      updateViewport()
    })
    ro.observe(container)

    return () => {
      clearTimeout(timer)
      ro.disconnect()
    }
  }, [scrollRef, computePositions, updateViewport])

  // Track scroll for viewport indicator
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleScroll = () => {
      if (!tickingRef.current) {
        requestAnimationFrame(() => {
          updateViewport()
          tickingRef.current = false
        })
        tickingRef.current = true
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [scrollRef, updateViewport])

  const handleTickClick = (marker: MarkerPosition) => {
    marker.element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleStripClick = (e: React.MouseEvent) => {
    const container = scrollRef.current
    const strip = stripRef.current
    if (!container || !strip) return

    const rect = strip.getBoundingClientRect()
    const percent = ((e.clientY - rect.top) / rect.height) * 100
    const targetScroll = (percent / 100) * container.scrollHeight - container.clientHeight / 2
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  }

  if (markers.length === 0) return null

  return (
    <div
      ref={stripRef}
      className="absolute right-0 top-0 bottom-0 z-10 cursor-pointer"
      style={{ width: 12 }}
      onClick={handleStripClick}
    >
      {/* Viewport indicator */}
      <div
        className="absolute left-0 right-0 rounded-sm pointer-events-none transition-[top] duration-75"
        style={{
          top: `${viewportTop}%`,
          height: `${Math.max(viewportHeight, 2)}%`,
          backgroundColor: 'var(--accent-color)',
          opacity: 0.15,
        }}
      />

      {/* Tick marks */}
      {markers.map((m) => (
        <div
          key={m.key}
          className="absolute left-1 rounded-sm"
          style={{
            top: `${m.percent}%`,
            width: 6,
            height: m.key.startsWith('heading') ? 2 : 3,
            backgroundColor: m.color,
            opacity: 0.8,
          }}
          title={m.tooltip}
          onClick={(e) => {
            e.stopPropagation()
            handleTickClick(m)
          }}
        />
      ))}
    </div>
  )
}
