import { useState, useEffect, useCallback } from 'react'
import { Sparkles, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/settingsStore'

/**
 * Ghost Text: When user selects text, shows a floating AI explain button.
 * On click, streams an inline explanation beneath the selection.
 */
export function GhostText() {
  const { t } = useTranslation()
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)
  const activeProvider = useSettingsStore((s) => s.activeProvider)

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      // Don't clear if explanation is showing
      if (!showExplanation) {
        setPosition(null)
        setSelectedText('')
      }
      return
    }

    const text = selection.toString()
    if (text.length < 5 || text.length > 2000) return // Too short or too long

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    // Only activate within markdown-body
    const container = range.commonAncestorContainer
    const el = container instanceof HTMLElement ? container : container.parentElement
    if (!el?.closest('.markdown-body')) return

    setSelectedText(text)
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    })
    setShowExplanation(false)
    setExplanation('')
  }, [showExplanation])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const handleExplain = async () => {
    if (!activeProvider || !selectedText) return

    setLoading(true)
    setShowExplanation(true)
    setExplanation('')

    try {
      const cleanup = window.electronAPI.onAgentStream((chunk: string) => {
        setExplanation((prev) => prev + chunk)
      })

      await window.electronAPI.sendAgentMessage({
        messages: [
          {
            role: 'user',
            content: `Briefly explain the following text in 2-3 concise sentences. Be clear and insightful:\n\n"${selectedText}"`,
          },
        ],
      })

      cleanup()
    } catch {
      setExplanation(t('agent.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    setPosition(null)
    setSelectedText('')
    setShowExplanation(false)
    setExplanation('')
    window.getSelection()?.removeAllRanges()
  }

  if (!position || !activeProvider) return null

  return (
    <>
      {/* Ghost Text trigger button */}
      {!showExplanation && (
        <button
          onClick={handleExplain}
          className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-lg border text-xs font-medium transition-all hover:scale-105"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--accent-color)',
            color: 'var(--accent-color)',
          }}
        >
          <Sparkles size={12} />
          {t('agent.contextMenu.explain')}
        </button>
      )}

      {/* Explanation panel */}
      {showExplanation && (
        <div
          className="fixed z-50 w-80 rounded-lg shadow-xl border overflow-hidden"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} style={{ color: 'var(--accent-color)' }} />
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Ghost Text
              </span>
            </div>
            <button
              onClick={handleDismiss}
              className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {/* Content */}
          <div className="px-3 py-2.5 max-h-48 overflow-y-auto">
            {loading && !explanation && (
              <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={12} className="animate-spin" />
                <span className="text-xs">{t('agent.thinking')}</span>
              </div>
            )}
            {explanation && (
              <p
                className="text-xs leading-relaxed whitespace-pre-wrap"
                style={{ color: 'var(--text-secondary)' }}
              >
                {explanation}
                {loading && (
                  <span
                    className="inline-block w-1 h-3 ml-0.5 animate-pulse"
                    style={{ backgroundColor: 'var(--accent-color)' }}
                  />
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
