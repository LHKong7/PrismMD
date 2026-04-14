import { useMemo, useState } from 'react'
import { Bot, User, AlertCircle, RotateCcw, Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChatMessage as ChatMessageType, CitationEvidence } from '../../store/agentStore'
import { useAgentStore } from '../../store/agentStore'
import { useFileStore } from '../../store/fileStore'
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
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const isError = !isUser && message.status === 'error'
  const scrollToEvidence = useReaderDomStore((s) => s.scrollToEvidence)
  const retryMessage = useAgentStore((s) => s.retryMessage)
  const currentContent = useFileStore((s) => s.currentContent)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const [copied, setCopied] = useState(false)

  const body = useMemo(() => {
    if (isUser) return message.content
    return renderWithCitations(message.content, message.evidence, (ev) => {
      scrollToEvidence(ev.text)
    })
  }, [message.content, message.evidence, isUser, scrollToEvidence])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can fail in restricted contexts — silently ignore,
      // the user will retry.
    }
  }

  return (
    <div
      className={`group flex gap-2.5 px-4 py-3 ${
        isError
          ? 'bg-red-500/[0.06]'
          : isUser
            ? ''
            : 'bg-black/[0.02] dark:bg-white/[0.02]'
      }`}
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: isError
            ? '#ef4444'
            : isUser
              ? 'var(--accent-color)'
              : 'var(--bg-secondary)',
        }}
      >
        {isError ? (
          <AlertCircle size={14} color="#fff" />
        ) : isUser ? (
          <User size={14} color="#fff" />
        ) : (
          <Bot size={14} style={{ color: 'var(--accent-color)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {isUser ? t('chat.you') : t('chat.assistant')}
          </span>
          {message.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              {message.model}
            </span>
          )}
          {isError && (
            <span className="text-[10px] font-semibold text-red-500">
              {t('chat.errorLabel')}
            </span>
          )}
          {!isUser && !isError && message.content && (
            // Copy button is always rendered but only visually revealed on
            // hover/focus to avoid adding noise to the transcript. `sr-only`
            // ensures it's still reachable with screen readers and keyboard.
            <button
              type="button"
              onClick={handleCopy}
              className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] p-0.5 rounded transition-opacity"
              aria-label={t('chat.copyMessage')}
              title={t('chat.copyMessage')}
            >
              {copied ? (
                <Check size={12} className="text-green-500" />
              ) : (
                <Copy size={12} style={{ color: 'var(--text-muted)' }} />
              )}
            </button>
          )}
        </div>
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: isError ? '#ef4444' : 'var(--text-secondary)' }}
        >
          {body}
        </div>

        {isError && message.errorRetryPrompt && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() =>
                void retryMessage(
                  message.id,
                  currentContent ?? undefined,
                  currentFilePath ?? undefined,
                )
              }
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
              style={{
                borderColor: '#ef4444',
                color: '#ef4444',
                backgroundColor: '#ef44441a',
              }}
              aria-label={t('chat.retry')}
            >
              <RotateCcw size={12} />
              {t('chat.retry')}
            </button>
          </div>
        )}

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
              {t('chat.sources')}
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
