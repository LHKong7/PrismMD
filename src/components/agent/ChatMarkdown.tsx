import { Fragment, useMemo } from 'react'
import type { ReactElement } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkRehype from 'remark-rehype'
import rehypeReact from 'rehype-react'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { CitationEvidence } from '../../store/agentStore'
import './chatMarkdown.css'

/**
 * Renders an assistant reply as GitHub-flavored markdown (headings, lists,
 * tables, code blocks, bold/italic, links) while keeping the app's `[N]`
 * citation markers as interactive superscripts.
 *
 * Citations are woven back in with a tiny rehype pass that splits `[N]`
 * tokens out of text nodes into <cite> elements (skipping code/pre so things
 * like `arr[0]` aren't mistaken for citations), which rehype-react then maps
 * to the same superscript used by the plain-text streaming preview.
 */

export function CitationSuperscript({
  evidence,
  onClick,
}: {
  evidence: CitationEvidence
  onClick: () => void
}) {
  return (
    <sup>
      <button
        type="button"
        onClick={onClick}
        title={evidence.text}
        aria-label={`Citation ${evidence.index}`}
        className="align-super mx-0.5 px-1 rounded text-[0.65em] font-semibold transition-colors"
        style={{
          color: 'var(--accent-color)',
          backgroundColor: 'color-mix(in srgb, var(--accent-color) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent-color) 25%, transparent)',
          lineHeight: 1,
        }}
      >
        {evidence.index}
      </button>
    </sup>
  )
}

/**
 * rehype plugin: split `[N]` markers (only for known citation indices) out of
 * text nodes into <cite> elements. Text inside <code>/<pre> is left untouched.
 */
function rehypeCitations(indices: Set<number>) {
  const splitText = (value: string): unknown[] => {
    if (indices.size === 0) return [{ type: 'text', value }]
    const re = /\[(\d{1,3})\]/g
    const parts: unknown[] = []
    let cursor = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(value)) !== null) {
      const num = Number(m[1])
      if (!indices.has(num)) continue
      if (m.index > cursor) parts.push({ type: 'text', value: value.slice(cursor, m.index) })
      parts.push({ type: 'element', tagName: 'cite', properties: {}, children: [{ type: 'text', value: String(num) }] })
      cursor = m.index + m[0].length
    }
    if (parts.length === 0) return [{ type: 'text', value }]
    if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) })
    return parts
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transform = (node: any, inCode: boolean) => {
    if (!Array.isArray(node.children) || node.children.length === 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any[] = []
    for (const child of node.children) {
      if (child.type === 'text' && !inCode) {
        out.push(...splitText(child.value as string))
      } else {
        if (child.type === 'element') {
          transform(child, inCode || child.tagName === 'code' || child.tagName === 'pre')
        }
        out.push(child)
      }
    }
    node.children = out
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => transform(tree, false)
}

function renderChatMarkdown(
  content: string,
  evidence: CitationEvidence[] | undefined,
  onCitationClick: (ev: CitationEvidence) => void,
): ReactElement {
  const byIndex = new Map((evidence ?? []).map((e) => [e.index, e]))
  const indices = new Set(byIndex.keys())

  const components = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cite: (props: any) => {
      const raw = props.children
      const num = Number(Array.isArray(raw) ? raw.join('') : raw)
      const ev = byIndex.get(num)
      if (!ev) return <>[{Number.isNaN(num) ? '' : num}]</>
      return <CitationSuperscript evidence={ev} onClick={() => onCitationClick(ev)} />
    },
    // Links open in the user's browser, never inside the app window.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: (props: any) => {
      const href: string | undefined = props.href
      return (
        <a
          href={href}
          onClick={(e: React.MouseEvent) => {
            if (href && /^https?:/i.test(href)) {
              e.preventDefault()
              void window.electronAPI.openExternal(href)
            }
          }}
        >
          {props.children}
        </a>
      )
    },
  }

  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkRehype)
    .use(rehypeCitations, indices)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .use(rehypeReact, { jsx, jsxs, Fragment, components } as any)
    .processSync(content)
  return file.result as ReactElement
}

export function ChatMarkdown({
  content,
  evidence,
  onCitationClick,
}: {
  content: string
  evidence: CitationEvidence[] | undefined
  onCitationClick: (ev: CitationEvidence) => void
}) {
  const rendered = useMemo(
    () => renderChatMarkdown(content, evidence, onCitationClick),
    [content, evidence, onCitationClick],
  )
  return <div className="chat-md">{rendered}</div>
}
