import { clsx } from 'clsx'
import type { TocEntry } from '../../lib/markdown/remarkToc'

interface TocItemProps {
  entry: TocEntry
  isActive: boolean
  onClick: (id: string) => void
}

export function TocItem({ entry, isActive, onClick }: TocItemProps) {
  const indent = (entry.depth - 1) * 12

  return (
    <button
      onClick={() => onClick(entry.id)}
      className={clsx(
        'w-full text-left text-xs py-1 px-2 rounded transition-colors truncate block',
        'hover:bg-black/5 dark:hover:bg-white/5',
        isActive && 'font-medium'
      )}
      style={{
        paddingLeft: 8 + indent,
        color: isActive ? 'var(--accent-color)' : 'var(--text-muted)',
      }}
      title={entry.text}
    >
      {entry.text}
    </button>
  )
}
