import { useState } from 'react'
import { Plus, Trash2, Copy, Pencil, Check, X, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePromptLibraryStore, type SavedPrompt } from '../../store/promptLibraryStore'
import { clsx } from 'clsx'

const CATEGORIES: { value: SavedPrompt['category']; labelKey: string; color: string }[] = [
  { value: 'general', labelKey: 'settings.promptLibrary.catGeneral', color: '#6b7280' },
  { value: 'writing', labelKey: 'settings.promptLibrary.catWriting', color: '#8b5cf6' },
  { value: 'analysis', labelKey: 'settings.promptLibrary.catAnalysis', color: '#3b82f6' },
  { value: 'coding', labelKey: 'settings.promptLibrary.catCoding', color: '#10b981' },
  { value: 'custom', labelKey: 'settings.promptLibrary.catCustom', color: '#f59e0b' },
]

export function PromptLibrary() {
  const { t } = useTranslation()
  const prompts = usePromptLibraryStore((s) => s.prompts)
  const addPrompt = usePromptLibraryStore((s) => s.addPrompt)
  const deletePrompt = usePromptLibraryStore((s) => s.deletePrompt)
  const duplicatePrompt = usePromptLibraryStore((s) => s.duplicatePrompt)
  const [showNew, setShowNew] = useState(false)

  const handleAdd = (name: string, content: string, category: SavedPrompt['category']) => {
    addPrompt(name, content, category)
    setShowNew(false)
  }

  const sorted = [...prompts].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('settings.promptLibrary.title')}
        </h3>
        <button
          onClick={() => setShowNew(true)}
          disabled={showNew}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Plus size={13} />
          {t('settings.promptLibrary.add')}
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.promptLibrary.description')}
      </p>

      {/* New prompt form */}
      {showNew && (
        <PromptEditor
          onSave={handleAdd}
          onCancel={() => setShowNew(false)}
          t={t}
        />
      )}

      {/* Empty state */}
      {prompts.length === 0 && !showNew && (
        <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--border-color)' }}>
          <BookOpen size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.promptLibrary.emptyTitle')}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('settings.promptLibrary.emptyDescription')}
          </p>
        </div>
      )}

      {/* Prompt list */}
      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onDelete={() => deletePrompt(prompt.id)}
              onDuplicate={() => duplicatePrompt(prompt.id)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PromptEditor({
  initial,
  onSave,
  onCancel,
  t,
}: {
  initial?: SavedPrompt
  onSave: (name: string, content: string, category: SavedPrompt['category']) => void
  onCancel: () => void
  t: (key: string, vars?: Record<string, unknown>) => string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [category, setCategory] = useState<SavedPrompt['category']>(initial?.category ?? 'custom')

  const canSave = name.trim() && content.trim()

  return (
    <div
      className="rounded-lg border p-3 mb-3 space-y-3"
      style={{ borderColor: 'var(--accent-color)', backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('settings.promptLibrary.namePlaceholder')}
        autoFocus
        className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent-color)]"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
      />

      {/* Category */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={clsx(
              'text-[10px] px-2 py-1 rounded-full border transition-colors',
              category === cat.value ? 'font-semibold' : 'opacity-60 hover:opacity-100',
            )}
            style={{
              borderColor: category === cat.value ? cat.color : 'var(--border-color)',
              color: category === cat.value ? '#fff' : 'var(--text-secondary)',
              backgroundColor: category === cat.value ? cat.color : 'transparent',
            }}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('settings.promptLibrary.contentPlaceholder')}
        rows={6}
        className="w-full text-xs px-3 py-2 rounded border outline-none resize-y font-mono"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-primary)',
        }}
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <X size={11} />
          {t('settings.promptLibrary.cancel')}
        </button>
        <button
          onClick={() => canSave && onSave(name.trim(), content.trim(), category)}
          disabled={!canSave}
          className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-ink, #fff)' }}
        >
          <Check size={11} />
          {t('settings.promptLibrary.save')}
        </button>
      </div>
    </div>
  )
}

function PromptCard({
  prompt,
  onDelete,
  onDuplicate,
  t,
}: {
  prompt: SavedPrompt
  onDelete: () => void
  onDuplicate: () => void
  t: (key: string, vars?: Record<string, unknown>) => string
}) {
  const updatePrompt = usePromptLibraryStore((s) => s.updatePrompt)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  const cat = CATEGORIES.find((c) => c.value === prompt.category) ?? CATEGORIES[4]

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (editing) {
    return (
      <PromptEditor
        initial={prompt}
        onSave={(name, content, category) => {
          updatePrompt(prompt.id, { name, content, category })
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
        t={t}
      />
    )
  }

  return (
    <div
      className="group rounded-lg border p-3"
      style={{ borderColor: 'var(--border-color)' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {prompt.name}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: cat.color, color: '#fff' }}
            >
              {t(cat.labelKey)}
            </span>
          </div>
          <p
            className="text-[11px] mt-1 line-clamp-2 font-mono"
            style={{ color: 'var(--text-muted)' }}
          >
            {prompt.content}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
            title={t('settings.promptLibrary.copy')}
          >
            {copied
              ? <Check size={12} style={{ color: 'var(--color-success)' }} />
              : <Copy size={12} style={{ color: 'var(--text-muted)' }} />}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
            title={t('settings.promptLibrary.edit')}
          >
            <Pencil size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
            title={t('settings.promptLibrary.duplicate')}
          >
            <Copy size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
            title={t('settings.promptLibrary.delete')}
          >
            <Trash2 size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>
    </div>
  )
}
