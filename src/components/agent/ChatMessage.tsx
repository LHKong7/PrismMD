import { useCallback, useState } from 'react'
import { Bot, User, AlertCircle, RotateCcw, Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChatMessage as ChatMessageType, CitationEvidence } from '../../store/agentStore'
import { useAgentStore } from '../../store/agentStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useReaderDomStore } from '../../store/readerDomStore'
import { ChatMarkdown, CitationSuperscript } from './ChatMarkdown'

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

export function ChatMessage({ message }: ChatMessageProps) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const isError = !isUser && message.status === 'error'
  const scrollToEvidence = useReaderDomStore((s) => s.scrollToEvidence)
  const retryMessage = useAgentStore((s) => s.retryMessage)
  const currentContent = useWorkspaceStore((s) => s.currentContent)
  const currentFilePath = useWorkspaceStore((s) => s.currentFilePath)
  const [copied, setCopied] = useState(false)

  const openPage = useWorkspaceStore((s) => s.openPage)

  const onCitationClick = useCallback(
    async (ev: CitationEvidence) => {
      // A citation from the note index points at a note that is very often
      // not the one on screen; scrolling the open document for a passage that
      // lives elsewhere finds nothing and looks like a dead link.
      if (ev.pageId && ev.pageId !== currentFilePath) {
        await openPage(ev.pageId)
        // The reader re-registers its DOM after the new note renders, so the
        // scroll has to wait for that frame.
        requestAnimationFrame(() => scrollToEvidence(ev.text))
        return
      }
      scrollToEvidence(ev.text)
    },
    [scrollToEvidence, openPage, currentFilePath],
  )

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
      className="group flex gap-2.5 px-4 py-3"
      style={
        isError
          ? { backgroundColor: 'var(--color-error-bg)' }
          : !isUser
            ? { backgroundColor: 'color-mix(in srgb, var(--text-primary) 3%, transparent)' }
            : undefined
      }
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: isError
            ? 'var(--color-error)'
            : isUser
              ? 'var(--accent-color)'
              : 'var(--bg-secondary)',
        }}
      >
        {isError ? (
          <AlertCircle size={14} color="#fff" />
        ) : isUser ? (
          <User size={14} style={{ color: 'var(--accent-ink, #fff)' }} />
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
            <span className="text-[10px] font-semibold" style={{ color: 'var(--color-error)' }}>
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
                <Check size={12} style={{ color: 'var(--color-success)' }} />
              ) : (
                <Copy size={12} style={{ color: 'var(--text-muted)' }} />
              )}
            </button>
          )}
        </div>
        <div
          className="text-sm leading-relaxed break-words"
          style={{ color: isError ? 'var(--color-error)' : 'var(--text-secondary)' }}
        >
          {isUser || isError ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <ChatMarkdown
              content={message.content}
              evidence={message.evidence}
              onCitationClick={onCitationClick}
            />
          )}
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
                borderColor: 'var(--color-error-border)',
                color: 'var(--color-error)',
                backgroundColor: 'var(--color-error-bg)',
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
