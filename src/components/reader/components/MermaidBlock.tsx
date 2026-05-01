import { useEffect, useRef, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import mermaid from 'mermaid'

let mermaidInitialized = false

function initMermaid(isDark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'strict',
  })
  mermaidInitialized = true
}

interface MermaidBlockProps {
  code: string
}

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const STEP = 0.1

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    if (!mermaidInitialized) {
      initMermaid(isDark)
    }

    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`

    mermaid.render(id, code)
      .then(({ svg }) => {
        setSvg(svg)
        setError('')
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to render diagram')
        setSvg('')
      })
  }, [code])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      setScale((s) => {
        const next = s + (e.deltaY < 0 ? STEP : -STEP)
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(next * 100) / 100))
      })
    }
  }, [])

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, Math.round((s + STEP) * 100) / 100))
  }, [])

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, Math.round((s - STEP) * 100) / 100))
  }, [])

  const resetZoom = useCallback(() => setScale(1), [])

  if (error) {
    return (
      <div
        className="rounded-lg p-4 my-4 text-sm"
        style={{ backgroundColor: 'var(--code-bg)', color: 'var(--text-muted)' }}
      >
        <p className="font-medium mb-1">Mermaid diagram error:</p>
        <p className="font-mono text-xs">{error}</p>
      </div>
    )
  }

  return (
    <div className="my-4 relative group rounded-lg" style={{ backgroundColor: 'var(--code-bg)' }}>
      {/* Zoom controls — visible on hover */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={zoomOut}
          className="p-1 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
          title="Zoom out"
        >
          <ZoomOut size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
        <span
          className="text-xs tabular-nums min-w-[3ch] text-center cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
          onClick={resetZoom}
          title="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
          title="Zoom in"
        >
          <ZoomIn size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
        {scale !== 1 && (
          <button
            onClick={resetZoom}
            className="p-1 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            title="Reset"
          >
            <RotateCcw size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {/* Diagram with zoom */}
      <div
        ref={containerRef}
        className="flex justify-center overflow-auto p-4"
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.1s ease-out',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}
