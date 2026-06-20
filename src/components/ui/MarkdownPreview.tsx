import { useMemo } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeReact from 'rehype-react'
import { Fragment } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { ReactElement } from 'react'

/**
 * Lightweight markdown renderer for previewing message content.
 * Uses remark/rehype but skips heavy plugins (math, mermaid, code analysis).
 */
function renderMarkdown(source: string): ReactElement {
  const result = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeReact, { jsx, jsxs, Fragment } as any)
    .processSync(source)
  return result.result as ReactElement
}

export function MarkdownPreview({
  content,
  className,
  style,
}: {
  content: string
  className?: string
  /** Merged over the defaults — lets callers override color/font-size. */
  style?: React.CSSProperties
}) {
  const rendered = useMemo(() => renderMarkdown(content), [content])

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ''}`}
      style={{
        color: 'var(--text-secondary)',
        fontSize: '0.75rem',
        lineHeight: '1.5',
        ...style,
      }}
    >
      {rendered}
    </div>
  )
}
