import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Copy, Check, MessageSquare, StickyNote, X, AlertCircle } from 'lucide-react'
import { useSelectionAIStore, type SelectionAIAction } from '../../store/selectionAIStore'
import { useAgentStore } from '../../store/agentStore'

interface SelectionAIBubbleProps {
  /**
   * Called when the user chooses "Save as note" on the AI result. Hooked
   * to `useAnnotations().addAnnotation` from the parent so we don't double
   * up on the annotations infra.
   */
  onSaveAsNote: (selectedText: string, note: string) => void
}

/**
 * Bubble that replaces the HighlightPopover once a user has picked an AI
 * action. Shows a spinner while the request is in flight, then the reply
 * with a row of follow-up actions (Copy / Save as note / Send to chat /
 * Close).
 *
 * Positioning mirrors HighlightPopover — we anchor above the selection
 * and clamp to the viewport so the bubble never drifts off-screen.
 */
export function SelectionAIBubble({ onSaveAsNote }: SelectionAIBubbleProps) {
  const { t } = useTranslation()
  const current = useSelectionAIStore((s) => s.current)
  const dismiss = useSelectionAIStore((s) => s.dismiss)
  const toggleAgentSidebar = useAgentStore((s) => s.setAgentSidebarOpen)
  const sendMessage = useAgentStore((s) => s.sendMessage)

  const bubbleRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [clampedPos, setClampedPos] = useState<{ left: number; top: number } | null>(null)

  // Clamp the anchor once the bubble measures itself so it stays on-screen.
  useEffect(() => {
    if (!current || !bubbleRef.current) {
      setClampedPos(null)
      return
    }
    const rect = bubbleRef.current.getBoundingClientRect()
    const margin = 12
    const rawLeft = current.anchor.x - rect.width / 2
    const rawTop = current.anchor.y - rect.height - 12
    const left = Math.min(
      Math.max(margin, rawLeft),
      window.innerWidth - rect.width - margin,
    )
    const top = Math.max(margin, rawTop)
    setClampedPos({ left, top })
  }, [current])

  // Esc closes the bubble.
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, dismiss])

  if (!current) return null

  const actionLabel: Record<SelectionAIAction, string> = {
    explain: t('selectionAI.action.explain'),
    translate: t('selectionAI.action.translate'),
    simplify: t('selectionAI.action.simplify'),
    'find-similar': t('selectionAI.action.findSimilar'),
  }

  const handleCopy = async () => {
    if (!current.reply) return
    try {
      await navigator.clipboard.writeText(current.reply)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore */
    }
  }

  const handleSendToChat = () => {
    if (!current.reply) return
    const prompt = [
      `> ${current.selectedText.replace(/\n/g, '\n> ')}`,
      '',
      current.reply,
    ].join('\n')
    // Open the sidebar and ask the assistant to continue on this.
    toggleAgentSidebar(true)
    sendMessage(prompt)
    dismiss()
  }

  const handleSaveAsNote = () => {
    if (!current.reply) return
    onSaveAsNote(current.selectedText, `[${actionLabel[current.action]}] ${current.reply}`)
    dismiss()
  }

  return (
    <div
      ref={bubbleRef}
      role="dialog"
      aria-live="polite"
      className="fixed z-50 w-[360px] max-w-[calc(100vw-24px)] rounded-lg shadow-lg border"
      style={{
        // Render offscreen until clamped so there's no visible jump.
        left: clampedPos?.left ?? -9999,
        top: clampedPos?.top ?? -9999,
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b text-xs font-semibold"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
      >
        <span>{actionLabel[current.action]}</span>
        <button
          onClick={dismiss}
          className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
          title={t('selectionAI.close')}
        >
          <X size={13} />
        </button>
      </div>

      <div className="px-3 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>
        {current.status === 'pending' && (
          <div
            className="flex items-center gap-2 py-3"
            style={{ color: 'var(--text-muted)' }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span>{t('selectionAI.pending')}</span>
          </div>
        )}
        {current.status === 'error' && (
          <div className="flex items-start gap-2 py-1 text-error">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span className="text-xs">{current.error ?? t('selectionAI.error')}</span>
          </div>
        )}
        {current.status === 'done' && current.reply && (
          <p
            className="whitespace-pre-wrap leading-relaxed max-h-[320px] overflow-y-auto"
            style={{ color: 'var(--text-primary)' }}
          >
            {current.reply}
          </p>
        )}
      </div>

      {current.status === 'done' && (
        <div
          className="flex items-center gap-1 px-2 py-1.5 border-t"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <BubbleButton onClick={handleCopy} icon={copied ? <Check size={12} /> : <Copy size={12} />}>
            {copied ? t('selectionAI.copied') : t('selectionAI.copy')}
          </BubbleButton>
          <BubbleButton onClick={handleSaveAsNote} icon={<StickyNote size={12} />}>
            {t('selectionAI.saveNote')}
          </BubbleButton>
          <BubbleButton onClick={handleSendToChat} icon={<MessageSquare size={12} />}>
            {t('selectionAI.sendToChat')}
          </BubbleButton>
        </div>
      )}
    </div>
  )
}

function BubbleButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      style={{ color: 'var(--text-secondary)' }}
    >
      {icon}
      {children}
    </button>
  )
}
