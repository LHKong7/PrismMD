import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Loader2, Share2 } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'

interface RelatedReport {
  reportId: string
  title?: string
  date?: string
  sourcePath?: string
  sharedEntities: string[]
  sharedEntityCount: number
}

/**
 * "Related" tab: other ingested documents that share entities with the
 * currently open file. Driven by a Cypher round-trip via the
 * `insightgraph:related-reports` IPC endpoint.
 *
 * The mapping from open file → reportId lives in `insightGraphStore.reports`
 * (populated whenever the user ingests). If the current file hasn't been
 * ingested yet, the tab surfaces a helpful empty state instead of silently
 * blanking.
 */
export function RelatedRail() {
  const { t } = useTranslation()
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const openFile = useFileStore((s) => s.openFile)
  const reports = useInsightGraphStore((s) => s.reports)
  const refreshReports = useInsightGraphStore((s) => s.refreshReports)

  const [items, setItems] = useState<RelatedReport[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'not-ingested'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Guarantee we have the latest reports so the file→reportId lookup works.
  useEffect(() => {
    refreshReports()
  }, [refreshReports])

  const currentReport = currentFilePath
    ? reports.find((r) => r.filePath === currentFilePath)
    : null

  useEffect(() => {
    let cancelled = false

    if (!currentFilePath) {
      setItems(null)
      setStatus('idle')
      return
    }
    if (!currentReport) {
      setItems(null)
      setStatus('not-ingested')
      return
    }

    const load = async () => {
      setStatus('loading')
      setError(null)
      try {
        const res = await window.electronAPI.insightGraphRelatedReports(
          currentReport.reportId,
          20,
        )
        if (cancelled) return
        if (!res.ok) {
          setError(res.error)
          setStatus('error')
          return
        }
        setItems(res.data)
        setStatus('idle')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [currentFilePath, currentReport?.reportId])

  if (!currentFilePath) {
    return (
      <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        {t('related.noFile')}
      </p>
    )
  }

  if (status === 'not-ingested') {
    return (
      <div className="px-3 py-4 text-center">
        <Share2 size={18} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('related.notIngested')}
        </p>
      </div>
    )
  }

  if (status === 'loading' && !items) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={12} className="animate-spin" />
        <span>{t('related.loading')}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <p className="px-3 py-4 text-xs text-center text-red-500">
        {t('related.error')}: {error ?? '—'}
      </p>
    )
  }

  if (!items || items.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        {t('related.none')}
      </p>
    )
  }

  return (
    <div className="px-2 py-2 space-y-1 overflow-y-auto h-full">
      {items.map((r) => {
        const label =
          r.title ?? (r.sourcePath ? r.sourcePath.split(/[/\\]/).pop() : undefined) ?? r.reportId
        const canOpen = !!r.sourcePath
        return (
          <button
            key={r.reportId}
            onClick={() => {
              if (canOpen && r.sourcePath) openFile(r.sourcePath)
            }}
            disabled={!canOpen}
            className="w-full text-left p-2 rounded border transition-colors hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <FileText size={12} style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {label}
              </span>
            </div>
            <div
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <Share2 size={10} />
              <span>
                {t('related.sharedCount', { count: r.sharedEntityCount })}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {r.sharedEntities.slice(0, 6).map((name) => (
                <span
                  key={name}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {name}
                </span>
              ))}
              {r.sharedEntities.length > 6 && (
                <span
                  className="text-[10px] px-1.5 py-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  +{r.sharedEntities.length - 6}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
