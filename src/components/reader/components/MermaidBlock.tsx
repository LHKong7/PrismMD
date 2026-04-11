import { useEffect, useRef, useState } from 'react'
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

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')

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
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
