import { useState, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

interface CodeBlockProps {
  children?: ReactNode
  className?: string
  [key: string]: unknown
}

export function CodeBlock({ children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

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

  // Check for Mermaid
  if (language === 'mermaid') {
    const { MermaidBlock } = require('./MermaidBlock')
    return <MermaidBlock code={textContent} />
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(textContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="rounded-lg overflow-hidden my-6"
      style={{ backgroundColor: 'var(--code-bg)' }}
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

      {/* Code content */}
      <pre {...props} className="!m-0 !rounded-none !bg-transparent">
        {children}
      </pre>
    </div>
  )
}
