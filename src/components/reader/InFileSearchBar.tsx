import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp, ChevronDown, X, Search } from 'lucide-react'

interface InFileSearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  currentIdx: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

export function InFileSearchBar({
  query,
  onQueryChange,
  matchCount,
  currentIdx,
  onPrev,
  onNext,
  onClose,
}: InFileSearchBarProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-md border shadow-sm"
      role="search"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-primary) 95%, transparent)',
        borderColor: 'var(--border-color)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Search size={12} style={{ color: 'var(--text-muted)' }} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) onPrev()
            else onNext()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder={t('inFileSearch.placeholder')}
        aria-label={t('inFileSearch.placeholder')}
        className="w-44 text-xs bg-transparent outline-none px-1 py-0.5"
        style={{ color: 'var(--text-primary)' }}
      />
      <span
        className="text-[10px] tabular-nums px-1"
        style={{ color: 'var(--text-muted)' }}
        aria-live="polite"
      >
        {matchCount === 0
          ? query
            ? t('inFileSearch.noMatch')
            : ''
          : t('inFileSearch.position', { current: currentIdx + 1, total: matchCount })}
      </span>
      <button
        onClick={onPrev}
        disabled={matchCount === 0}
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"
        title={t('inFileSearch.prev')}
        aria-label={t('inFileSearch.prev')}
      >
        <ChevronUp size={12} style={{ color: 'var(--text-secondary)' }} />
      </button>
      <button
        onClick={onNext}
        disabled={matchCount === 0}
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"
        title={t('inFileSearch.next')}
        aria-label={t('inFileSearch.next')}
      >
        <ChevronDown size={12} style={{ color: 'var(--text-secondary)' }} />
      </button>
      <button
        onClick={onClose}
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
        title={t('inFileSearch.close')}
        aria-label={t('inFileSearch.close')}
      >
        <X size={12} style={{ color: 'var(--text-secondary)' }} />
      </button>
    </div>
  )
}
