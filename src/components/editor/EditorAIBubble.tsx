import { useState, useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Loader2, AlertCircle, Check, X } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import type { EditorSelectionInfo } from './editorAIPlugin'
import { useTranslation } from 'react-i18next'

interface Props {
  selection: EditorSelectionInfo
  viewRef: RefObject<EditorView | null>
  onDismiss: () => void
}

type Phase = 'idle' | 'loading' | 'done' | 'error'

export function EditorAIBubble({ selection, viewRef, onDismiss }: Props) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const bubbleRef = useRef<HTMLDivElement>(null)

  // Dismiss on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  // Dismiss on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    // Delay to avoid immediately dismissing from the selection click
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [onDismiss])

  const handleRewrite = async () => {
    setPhase('loading')
    try {
      const res = await window.electronAPI.sendAgentOneShot({
        systemPrompt: 'You are a writing assistant. Rewrite the following text to improve clarity, flow, and readability while preserving the original meaning and language. Output ONLY the rewritten text, no explanations.',
        prompt: `Rewrite this:\n\n"""\n${selection.text}\n"""`,
      })
      if (res.ok) {
        const rewritten = res.result.reply.trim()
        setResult(rewritten)
        setPhase('done')
      } else {
        setError(res.error || t('editorAI.error'))
        setPhase('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const handleAccept = () => {
    const view = viewRef.current
    if (view && result) {
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: result },
      })
    }
    onDismiss()
  }

  const handleReject = () => {
    setPhase('idle')
    setResult('')
    setError('')
  }

  // Position: above the selection anchor, clamped to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(selection.anchor.x - 20, window.innerWidth - 280)),
    top: Math.max(8, selection.anchor.y - 12),
    transform: 'translateY(-100%)',
    zIndex: 70,
  }

  return createPortal(
    <div ref={bubbleRef} style={style} className="select-none">
      {phase === 'idle' && (
        <button
          onClick={handleRewrite}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg border transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            color: 'var(--accent-color)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-primary)'
          }}
        >
          <Sparkles size={13} />
          {t('editorAI.rewrite')}
        </button>
      )}

      {phase === 'loading' && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs shadow-lg border"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          <Loader2 size={13} className="animate-spin" />
          {t('editorAI.rewriting')}
        </div>
      )}

      {phase === 'done' && (
        <div
          className="rounded-lg shadow-lg border overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            maxWidth: 400,
          }}
        >
          <div
            className="px-3 py-2 text-xs max-h-48 overflow-y-auto whitespace-pre-wrap"
            style={{ color: 'var(--text-primary)' }}
          >
            {result}
          </div>
          <div
            className="flex items-center gap-1 px-2 py-1.5 border-t"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <button
              onClick={handleAccept}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
              style={{ color: 'var(--color-success)' }}
            >
              <Check size={12} />
              {t('editorAI.accept')}
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
              {t('editorAI.reject')}
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs shadow-lg border"
          style={{
            backgroundColor: 'var(--color-error-bg)',
            borderColor: 'var(--color-error-border)',
            color: 'var(--color-error)',
          }}
        >
          <AlertCircle size={13} />
          {error}
        </div>
      )}
    </div>,
    document.body,
  )
}
