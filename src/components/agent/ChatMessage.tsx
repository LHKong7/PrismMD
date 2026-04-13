import { useMemo } from 'react'
import { Bot, User } from 'lucide-react'
import type { ChatMessage as ChatMessageType, CitationEvidence } from '../../store/agentStore'
import { useReaderDomStore } from '../../store/readerDomStore'

interface ChatMessageProps {
  message: ChatMessageType
}

/**
 * Parse the reply for `[N]` citation markers and render them as
 * click/hover superscripts. Pure segmentation — the assistant's own
 * prose is still rendered as whitespace-preserving text, and any marker
 * that references an unknown evidence index is passed through as plain
 * text (avoids false positives like `arr[0]` in code blocks).
 *
 * Exported for reuse in the streaming preview inside AgentSidebar so
 * citations become interactive as soon as the model emits them.
 */
export function renderWithCitations(
  content: string,
  evidence: CitationEvidence[] | undefined,
  onCitationClick: (ev: CitationEvidence) => void,
): React.ReactNode {
  if (!evidence || evidence.length === 0) return content

  const byIndex = new Map(evidence.map((e) => [e.index, e]))
  const parts: React.ReactNode[] = []
  const re = /\[(\d{1,3})\]/g
  let cursor = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = re.exec(content)) !== null) {
    const num = Number(match[1])
    const ev = byIndex.get(num)
    if (!ev) continue // Unknown number — leave as literal text below.

    if (match.index > cursor) {
      parts.push(content.slice(cursor, match.index))
    }
    parts.push(
      <CitationSuperscript
        key={`c-${key++}-${num}`}
        evidence={ev}
        onClick={() => onCitationClick(ev)}
      />,
    )
    cursor = match.index + match[0].length
  }
  if (cursor < content.length) {
    parts.push(content.slice(cursor))
  }
  return parts
}

function CitationSuperscript({
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

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const scrollToEvidence = useReaderDomStore((s) => s.scrollToEvidence)

  const body = useMemo(() => {
    if (isUser) return message.content
    return renderWithCitations(message.content, message.evidence, (ev) => {
      scrollToEvidence(ev.text)
    })
  }, [message.content, message.evidence, isUser, scrollToEvidence])

  return (
    <div className={`flex gap-2.5 px-4 py-3 ${isUser ? '' : 'bg-black/[0.02] dark:bg-white/[0.02]'}`}>
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: isUser ? 'var(--accent-color)' : 'var(--bg-secondary)',
        }}
      >
        {isUser ? (
          <User size={14} color="#fff" />
        ) : (
          <Bot size={14} style={{ color: 'var(--accent-color)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {isUser ? 'You' : 'AI'}
          </span>
          {message.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              {message.model}
            </span>
          )}
        </div>
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: 'var(--text-secondary)' }}
        >
          {body}
        </div>

        {/* Sources footer — also clickable, so users can navigate from
            citation numbers they couldn't find inline. */}
        {!isUser && message.evidence && message.evidence.length > 0 && (
          <div
            className="mt-2 pt-2 border-t text-[11px]"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div
              className="font-semibold mb-1 uppercase tracking-wider text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Sources
            </div>
            <ol className="space-y-0.5">
              {message.evidence.map((ev) => (
                <li key={ev.index} className="flex gap-1.5">
                  <button
                    onClick={() => scrollToEvidence(ev.text)}
                    className="text-left hover:underline"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span style={{ color: 'var(--accent-color)' }}>[{ev.index}]</span>{' '}
                    <span className="line-clamp-2">{ev.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
