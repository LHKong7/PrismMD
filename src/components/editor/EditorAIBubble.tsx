import { useState, useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  Sparkles,
  Scissors,
  Expand,
  SpellCheck,
  Palette,
  Loader2,
  AlertCircle,
  Check,
  X,
  RotateCcw,
  Send,
} from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import type { EditorSelectionInfo } from './editorAIPlugin'
import { setAIHighlight } from './editorAIHighlight'
import { useTranslation } from 'react-i18next'
import { usePromptConfigStore, type PromptMode } from '../../store/promptConfigStore'

interface Props {
  selection: EditorSelectionInfo
  viewRef: RefObject<EditorView | null>
  onDismiss: () => void
  focusCustomInput?: boolean
}

type Phase = 'idle' | 'loading' | 'done' | 'error'
type ToneOption = 'formal' | 'casual' | 'academic' | 'creative'

const SYSTEM_PROMPTS: Record<string, string> = {
  rewrite:
    'You are a writing assistant. Rewrite the following text to improve clarity, flow, and readability while preserving the original meaning and language. Output ONLY the rewritten text, no explanations.',
  shorten:
    'You are a writing assistant. Condense the following text to be more concise while preserving all key information and the original language. Output ONLY the shortened text, no explanations.',
  expand:
    'You are a writing assistant. Elaborate on the following text, adding more detail, examples, or explanation while preserving the original language. Output ONLY the expanded text, no explanations.',
  fixGrammar:
    'You are a writing assistant. Fix grammar, spelling, and punctuation errors in the following text. Make minimal changes and preserve the original language. Output ONLY the corrected text, no explanations.',
  'tone-formal':
    'You are a writing assistant. Rewrite the following text in a formal, professional tone while preserving the original language. Output ONLY the rewritten text, no explanations.',
  'tone-casual':
    'You are a writing assistant. Rewrite the following text in a casual, conversational tone while preserving the original language. Output ONLY the rewritten text, no explanations.',
  'tone-academic':
    'You are a writing assistant. Rewrite the following text in an academic, scholarly tone while preserving the original language. Output ONLY the rewritten text, no explanations.',
  'tone-creative':
    'You are a writing assistant. Rewrite the following text in a creative, expressive tone while preserving the original language. Output ONLY the rewritten text, no explanations.',
  custom:
    'You are a writing assistant. Follow the user\'s instruction exactly. Preserve the original language unless told otherwise. Output ONLY the modified text, no explanations.',
}

export function EditorAIBubble({ selection, viewRef, onDismiss, focusCustomInput }: Props) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [lastAction, setLastAction] = useState('')
  const [lastCustom, setLastCustom] = useState('')
  const [showTone, setShowTone] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const bubbleRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus custom input when requested (e.g. via Cmd+K)
  useEffect(() => {
    if (focusCustomInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [focusCustomInput])

  // Clear highlight on unmount (covers all dismiss paths)
  useEffect(() => {
    return () => {
      const view = viewRef.current
      if (view) {
        try { view.dispatch({ effects: setAIHighlight.of(null) }) } catch { /* view may be destroyed */ }
      }
    }
  }, [viewRef])

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
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [onDismiss])

  const highlightSelection = () => {
    const view = viewRef.current
    if (view) {
      view.dispatch({ effects: setAIHighlight.of({ from: selection.from, to: selection.to }) })
    }
  }

  const clearHighlight = () => {
    const view = viewRef.current
    if (view) {
      view.dispatch({ effects: setAIHighlight.of(null) })
    }
  }

  const runAction = async (actionKey: string, userPromptOverride?: string) => {
    setPhase('loading')
    setLastAction(actionKey)
    setShowTone(false)
    highlightSelection()
    try {
      // Map action keys to configurable prompt modes
      const promptModeMap: Record<string, PromptMode> = {
        rewrite: 'editor-rewrite',
        shorten: 'editor-shorten',
        expand: 'editor-expand',
        fixGrammar: 'editor-fix-grammar',
        custom: 'editor-custom',
      }
      const configMode = promptModeMap[actionKey]
      const systemPrompt = configMode
        ? usePromptConfigStore.getState().getPrompt(configMode)
        : SYSTEM_PROMPTS[actionKey] || SYSTEM_PROMPTS.custom
      const prompt = userPromptOverride
        ? `Instruction: ${userPromptOverride}\n\nText:\n"""\n${selection.text}\n"""`
        : `Text:\n"""\n${selection.text}\n"""`

      const res = await window.electronAPI.sendAgentOneShot({
        systemPrompt,
        prompt,
      })
      if (res.ok) {
        setResult(res.result.reply.trim())
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

  const handleAction = (actionKey: string) => {
    runAction(actionKey)
  }

  const handleTone = (tone: ToneOption) => {
    runAction(`tone-${tone}`)
  }

  const handleCustomSubmit = () => {
    const instruction = customInput.trim()
    if (!instruction) return
    setLastCustom(instruction)
    runAction('custom', instruction)
  }

  const handleAccept = () => {
    clearHighlight()
    const view = viewRef.current
    if (view && result) {
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: result },
      })
    }
    onDismiss()
  }

  const handleReject = () => {
    clearHighlight()
    setPhase('idle')
    setResult('')
    setError('')
  }

  const handleRetry = () => {
    if (lastAction === 'custom') {
      runAction('custom', lastCustom)
    } else {
      runAction(lastAction)
    }
  }

  // Position: above the selection anchor, clamped to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(selection.anchor.x - 20, window.innerWidth - 340)),
    top: Math.max(8, selection.anchor.y - 12),
    transform: 'translateY(-100%)',
    zIndex: 70,
  }

  const btnClass =
    'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer'

  const toneOptions: ToneOption[] = ['formal', 'casual', 'academic', 'creative']

  return createPortal(
    <div ref={bubbleRef} style={style} className="select-none">
      {phase === 'idle' && (
        <div
          className="rounded-lg shadow-lg border overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            maxWidth: Math.min(380, window.innerWidth - 24),
          }}
        >
          {/* Action buttons row */}
          <div
            className="flex items-center gap-0.5 px-2 py-1.5 border-b"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <button
              onClick={() => handleAction('rewrite')}
              className={btnClass}
              style={{ color: 'var(--accent-color)' }}
              title={t('editorAI.rewrite')}
            >
              <Sparkles size={12} />
              {t('editorAI.rewrite')}
            </button>
            <button
              onClick={() => handleAction('shorten')}
              className={btnClass}
              style={{ color: 'var(--text-secondary)' }}
              title={t('editorAI.shorten')}
            >
              <Scissors size={12} />
              {t('editorAI.shorten')}
            </button>
            <button
              onClick={() => handleAction('expand')}
              className={btnClass}
              style={{ color: 'var(--text-secondary)' }}
              title={t('editorAI.expand')}
            >
              <Expand size={12} />
              {t('editorAI.expand')}
            </button>
            <button
              onClick={() => handleAction('fixGrammar')}
              className={btnClass}
              style={{ color: 'var(--text-secondary)' }}
              title={t('editorAI.fixGrammar')}
            >
              <SpellCheck size={12} />
              {t('editorAI.fixGrammar')}
            </button>
            <button
              onClick={() => setShowTone(!showTone)}
              className={btnClass}
              style={{ color: showTone ? 'var(--accent-color)' : 'var(--text-secondary)' }}
              title={t('editorAI.changeTone')}
            >
              <Palette size={12} />
              {t('editorAI.changeTone')}
            </button>
          </div>

          {/* Tone sub-options */}
          {showTone && (
            <div
              className="flex items-center gap-1 px-2 py-1.5 border-b"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {toneOptions.map((tone) => (
                <button
                  key={tone}
                  onClick={() => handleTone(tone)}
                  className="px-2 py-0.5 rounded-full text-xs transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--accent-color)'
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                >
                  {t(`editorAI.tone${tone.charAt(0).toUpperCase() + tone.slice(1)}`)}
                </button>
              ))}
            </div>
          )}

          {/* Custom instruction input */}
          <div className="flex items-center gap-1 px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCustomSubmit()
                }
              }}
              placeholder={t('editorAI.customPlaceholder')}
              className="flex-1 px-2 py-1 rounded text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            />
            <button
              onClick={handleCustomSubmit}
              className="p-1 rounded transition-colors cursor-pointer"
              style={{ color: customInput.trim() ? 'var(--accent-color)' : 'var(--text-muted)' }}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
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
          {t('editorAI.processing')}
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
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--color-success)' }}
            >
              <Check size={12} />
              {t('editorAI.accept')}
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
              {t('editorAI.reject')}
            </button>
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RotateCcw size={12} />
              {t('editorAI.retry')}
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div
          className="rounded-lg shadow-lg border overflow-hidden"
          style={{
            backgroundColor: 'var(--color-error-bg)',
            borderColor: 'var(--color-error-border)',
            maxWidth: 400,
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--color-error)' }}>
            <AlertCircle size={13} />
            {error}
          </div>
          <div
            className="flex items-center gap-1 px-2 py-1.5 border-t"
            style={{ borderColor: 'var(--color-error-border)' }}
          >
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RotateCcw size={12} />
              {t('editorAI.retry')}
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
              {t('editorAI.reject')}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
