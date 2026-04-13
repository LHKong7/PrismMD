import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Languages, Minimize2 } from 'lucide-react'
import type { AnnotationColor } from '../../types/annotation'
import { useSelectionAIStore, type SelectionAIAction } from '../../store/selectionAIStore'
import { useSettingsStore } from '../../store/settingsStore'
import { LANGUAGES } from '../../i18n'

const COLORS: { name: AnnotationColor; bg: string }[] = [
  { name: 'yellow', bg: 'var(--highlight-yellow)' },
  { name: 'green', bg: 'var(--highlight-green)' },
  { name: 'blue', bg: 'var(--highlight-blue)' },
  { name: 'pink', bg: 'var(--highlight-pink)' },
  { name: 'purple', bg: 'var(--highlight-purple)' },
]

interface HighlightPopoverProps {
  onHighlight: (text: string, color: AnnotationColor) => void
}

/**
 * Floating toolbar that appears on text selection. Combines the original
 * 5-color highlight picker with selection-scoped AI actions. Clicking an
 * AI action hands off to `selectionAIStore` + `SelectionAIBubble`; the
 * popover itself closes and lets the bubble take over.
 */
export function HighlightPopover({ onHighlight }: HighlightPopoverProps) {
  const { t } = useTranslation()
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const startAction = useSelectionAIStore((s) => s.startAction)
  const completeAction = useSelectionAIStore((s) => s.completeAction)
  const failAction = useSelectionAIStore((s) => s.failAction)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const uiLanguage = useSettingsStore((s) => s.language)

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setPosition(null)
      return
    }

    const text = selection.toString()
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    setSelectedText(text)
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  if (!position) return null

  const runAIAction = async (action: SelectionAIAction) => {
    const anchor = { x: position.x, y: position.y }
    setPosition(null)
    window.getSelection()?.removeAllRanges()

    const requestId = startAction({ action, selectedText, anchor })

    const targetLanguage =
      LANGUAGES.find((l) => l.code === uiLanguage)?.name ?? 'English'

    const prompts: Record<SelectionAIAction, { system: string; user: string }> = {
      explain: {
        system:
          'You are a thoughtful reading tutor. When given a passage, explain it concisely for a curious reader. Keep the explanation under 150 words, use plain language, and avoid restating the passage verbatim.',
        user: `Explain the following passage:\n\n"""\n${selectedText}\n"""`,
      },
      translate: {
        system: `You are a careful translator. Translate the passage into ${targetLanguage}, preserving tone and technical terms. Output ONLY the translation, without commentary.`,
        user: `Translate this passage:\n\n"""\n${selectedText}\n"""`,
      },
      simplify: {
        system:
          'You are an editor who rewrites passages in plain, direct language so a general audience can understand them. Preserve every fact and claim. Output only the rewritten passage, no commentary.',
        user: `Rewrite the following passage in simpler language:\n\n"""\n${selectedText}\n"""`,
      },
      'find-similar': {
        system:
          'Given a passage, extract 3–5 key concepts or search phrases that would help find related reading material. Output as a short bulleted list.',
        user: `Passage:\n\n"""\n${selectedText}\n"""`,
      },
    }

    const { system, user } = prompts[action]

    try {
      const res = await window.electronAPI.sendAgentOneShot({
        prompt: user,
        systemPrompt: system,
      })
      if (res.ok) {
        completeAction(requestId, res.result.reply.trim())
      } else {
        failAction(requestId, res.error)
      }
    } catch (err) {
      failAction(requestId, err instanceof Error ? err.message : String(err))
    }
  }

  const aiDisabled = !activeProvider

  return (
    <div
      className="fixed z-50 flex items-center gap-1 p-1.5 rounded-lg shadow-lg border"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)',
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {COLORS.map(({ name, bg }) => (
        <button
          key={name}
          onClick={() => {
            onHighlight(selectedText, name)
            setPosition(null)
            window.getSelection()?.removeAllRanges()
          }}
          className="w-5 h-5 rounded-full border transition-transform hover:scale-125"
          style={{
            backgroundColor: bg,
            borderColor: 'var(--border-color)',
          }}
          title={t('highlightPopover.highlightAs', { color: name })}
        />
      ))}

      <div
        className="w-px h-5 mx-1"
        style={{ backgroundColor: 'var(--border-color)' }}
        aria-hidden
      />

      <AIActionButton
        disabled={aiDisabled}
        onClick={() => runAIAction('explain')}
        title={t('selectionAI.action.explain')}
      >
        <Sparkles size={13} />
      </AIActionButton>
      <AIActionButton
        disabled={aiDisabled}
        onClick={() => runAIAction('translate')}
        title={t('selectionAI.action.translate')}
      >
        <Languages size={13} />
      </AIActionButton>
      <AIActionButton
        disabled={aiDisabled}
        onClick={() => runAIAction('simplify')}
        title={t('selectionAI.action.simplify')}
      >
        <Minimize2 size={13} />
      </AIActionButton>
    </div>
  )
}

function AIActionButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}
