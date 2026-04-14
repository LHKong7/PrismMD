import { useTranslation } from 'react-i18next'

/**
 * CsvViewer — placeholder. Full implementation (papaparse + TanStack
 * Table + virtualized rows) arrives in a follow-up commit on this branch.
 */
export function CsvViewer() {
  const { t } = useTranslation()
  return (
    <div
      className="h-full flex items-center justify-center p-8 text-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-sm">
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('reader.csv.placeholderTitle')}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('reader.csv.placeholderBody')}
        </p>
      </div>
    </div>
  )
}
