import { useTranslation } from 'react-i18next'
import { Code2, Table2 } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  raw: boolean
  onChange: (raw: boolean) => void
  /** Label for the non-raw side ("Table" for CSV, "Tree" for JSON). */
  previewLabel: string
}

/**
 * Preview ⇄ Raw switch for structured text formats.
 *
 * CSV and JSON have both a useful rendering (table / tree) and a source the
 * user may legitimately want to fix by hand. Markdown doesn't need this — it
 * is always editable — and binary formats have no source to show, so this
 * only appears above the CSV and JSON viewers.
 */
export function ViewModeToggle({ raw, onChange, previewLabel }: Props) {
  const { t } = useTranslation()

  return (
    <div
      className="flex items-center justify-end gap-1 px-3 py-1 border-b flex-shrink-0"
      style={{ borderColor: 'var(--border-color)' }}
    >
      <Segment active={!raw} onClick={() => onChange(false)} icon={<Table2 size={12} />} label={previewLabel} />
      <Segment active={raw} onClick={() => onChange(true)} icon={<Code2 size={12} />} label={t('reader.viewMode.raw', 'Raw')} />
    </div>
  )
}

function Segment({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
        !active && 'hover:bg-black/5 dark:hover:bg-white/5',
      )}
      style={{
        backgroundColor: active ? 'var(--bg-secondary)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
