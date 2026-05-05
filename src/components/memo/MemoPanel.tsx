import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, StickyNote, GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface MemoItem {
  id: string
  text: string
  createdAt: number
}

const STORAGE_KEY = 'prismmd-memo-items'
const POS_STORAGE_KEY = 'prismmd-memo-pos'

function loadMemos(): MemoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveMemos(items: MemoItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function loadPosition(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* use default */ }
  return { x: window.innerWidth - 340, y: 80 }
}

function savePosition(pos: { x: number; y: number }) {
  localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos))
}

interface Props {
  open: boolean
  onClose: () => void
}

export function MemoPanel({ open, onClose }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<MemoItem[]>(loadMemos)
  const [inputValue, setInputValue] = useState('')
  const [pos, setPos] = useState(loadPosition)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Persist memos
  useEffect(() => {
    saveMemos(items)
  }, [items])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const addMemo = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    setItems((prev) => [
      { id: crypto.randomUUID(), text, createdAt: Date.now() },
      ...prev,
    ])
    setInputValue('')
  }, [inputValue])

  const removeMemo = useCallback((id: string) => {
    setItems((prev) => prev.filter((m) => m.id !== id))
  }, [])

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      const newPos = {
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y)),
      }
      setPos(newPos)
    }
    const handleUp = () => {
      setDragging(false)
      savePosition(pos)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, pos])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 rounded-xl shadow-2xl border overflow-hidden flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        width: 300,
        maxHeight: 420,
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header — draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b cursor-move select-none"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripVertical size={12} style={{ color: 'var(--text-muted)' }} />
          <StickyNote size={14} style={{ color: 'var(--accent-color)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('memo.title')}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Input area */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                addMemo()
              }
            }}
            placeholder={t('memo.placeholder')}
            rows={2}
            className="flex-1 text-xs px-2 py-1.5 rounded border outline-none resize-none"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={addMemo}
            className="self-end p-1.5 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            title={t('memo.add')}
            style={{ color: 'var(--accent-color)' }}
          >
            <Plus size={16} />
          </button>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('memo.hint')}
        </p>
      </div>

      {/* Memo list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 60 }}>
        {items.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
            {t('memo.empty')}
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex gap-2 py-1.5 border-b last:border-b-0"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <p
              className="flex-1 text-xs whitespace-pre-wrap break-words"
              style={{ color: 'var(--text-primary)' }}
            >
              {item.text}
            </p>
            <button
              onClick={() => removeMemo(item.id)}
              className="self-start p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10 dark:hover:bg-white/10"
              title={t('memo.delete')}
            >
              <Trash2 size={11} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
