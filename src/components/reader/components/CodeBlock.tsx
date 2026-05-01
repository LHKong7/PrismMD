import { useState, useRef, useCallback, type ReactNode } from 'react'
import { Copy, Check, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { lookupMarkdownRenderer } from '../../../lib/markdown/rendererRegistry'
import { isSandboxable } from '../../../lib/sandbox/sandboxLanguages'
import { SandboxedCodeBlock } from './SandboxedCodeBlock'

interface CodeBlockProps {
  children?: ReactNode
  className?: string
  [key: string]: unknown
}

export function CodeBlock({ children, ...props }: CodeBlockProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [sandboxActive, setSandboxActive] = useState(false)
  const [hovered, setHovered] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Extract language and text from children
  let language = ''
  let textContent = ''

  // rehype-react wraps code in <pre><code>
  // children is the <code> element
  if (children && typeof children === 'object' && 'props' in (children as React.ReactElement)) {
    const codeEl = children as React.ReactElement<{ className?: string; children?: ReactNode }>
    const className = codeEl.props.className ?? ''
    const langMatch = className.match(/language-(\w+)/)
    language = langMatch?.[1] ?? ''

    // Extract text content for copy
    const extractText = (node: ReactNode): string => {
      if (typeof node === 'string') return node
      if (typeof node === 'number') return String(node)
      if (!node) return ''
      if (Array.isArray(node)) return node.map(extractText).join('')
      if (typeof node === 'object' && 'props' in (node as React.ReactElement)) {
        return extractText((node as React.ReactElement<{ children?: ReactNode }>).props.children)
      }
      return ''
    }
    textContent = extractText(codeEl.props.children)
  }

  // Plugin-contributed language renderers (e.g. the built-in mermaid
  // plugin). If none is registered for this language, fall through to
  // the default copy-aware code card below.
  if (language) {
    const PluginRenderer = lookupMarkdownRenderer(language)
    if (PluginRenderer) {
      return <PluginRenderer code={textContent} />
    }
  }

  const canSandbox = isSandboxable(language)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(textContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleMouseEnter = useCallback(() => {
    if (!canSandbox) return
    hoverTimer.current = setTimeout(() => setHovered(true), 200)
  }, [canSandbox])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHovered(false)
  }, [])

  // When sandbox is active, render the sandboxed view
  if (sandboxActive) {
    return (
      <SandboxedCodeBlock
        code={textContent}
        language={language}
        onClose={() => setSandboxActive(false)}
      />
    )
  }

  return (
    <div
      className="rounded-lg overflow-hidden my-6 relative"
      style={{ backgroundColor: 'var(--code-bg)' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* macOS-style header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2">
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          {language && (
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
              {language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Sandbox play button — shown on hover for sandboxable languages */}
          {hovered && canSandbox && (
            <button
              onClick={() => setSandboxActive(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--color-success)' }}
              title={t('sandbox.run')}
            >
              <Play size={12} />
              {t('sandbox.run')}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check size={14} style={{ color: 'var(--accent-color)' }} />
            ) : (
              <Copy size={14} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>
        </div>
      </div>

      {/* Code content */}
      <pre {...props} className="!m-0 !rounded-none !bg-transparent">
        {children}
      </pre>
    </div>
  )
}
