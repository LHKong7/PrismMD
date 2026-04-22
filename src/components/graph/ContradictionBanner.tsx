import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, X, ChevronRight } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUIStore } from '../../store/uiStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'

interface EntityContradictions {
  entityName: string
  count: number
}

/**
 * Dismissible banner pinned to the top of the reader whenever the open
 * document contains entities the SDK flags with contradictory claims.
 *
 * Flow:
 *  1. On document open, ensure we know the file's reportId (requires the
 *     user to have ingested it — otherwise the banner is invisible by
 *     design).
 *  2. Fetch the set of entities belonging to this report via
 *     `insightGraphEntitiesForReport`.
 *  3. Run `findContradictions` per-entity, concurrently but capped to
 *     keep latency manageable on large docs.
 *  4. Collapse into a per-entity count; if any are non-zero, render the
 *     banner with a click target that opens the Entity tab at that
 *     entity.
 *
 * Dismissal is session-local and file-local (keyed by reportId) so
 * reopening the same file within a session doesn't nag; a fresh session
 * resurfaces it.
 */
export function ContradictionBanner() {
  const { t } = useTranslation()
  const graphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const reports = useInsightGraphStore((s) => s.reports)
  const getContradictions = useInsightGraphStore((s) => s.getContradictions)
  const focusEntity = useUIStore((s) => s.focusEntity)
  const setRightSidebarTab = useUIStore((s) => s.setRightSidebarTab)
  const setRightSidebarOpen = useUIStore((s) => s.setRightSidebarOpen)

  const [conflicts, setConflicts] = useState<EntityContradictions[]>([])
  const [dismissedReports, setDismissedReports] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  // Resolve the current file's reportId (if it's been ingested).
  const report = useMemo(() => {
    if (!currentFilePath) return null
    return reports.find((r) => r.filePath === currentFilePath) ?? null
  }, [currentFilePath, reports])

  useEffect(() => {
    let cancelled = false
    setConflicts([])

    if (!graphEnabled || !report) return
    if (dismissedReports.has(report.reportId)) return

    const run = async () => {
      setLoading(true)
      try {
        const ent = await window.electronAPI.insightGraphEntitiesForReport(report.reportId)
        if (cancelled || !ent.ok) return

        // Cap the per-document check so a doc with hundreds of entities
        // doesn't fire a flurry of LLM-backed `findContradictions` calls.
        const CAP = 12
        const names = ent.data.slice(0, CAP)

        const results = await Promise.all(
          names.map(async (name) => {
            try {
              const rows = await getContradictions(name)
              return { entityName: name, count: rows.length }
            } catch {
              return { entityName: name, count: 0 }
            }
          }),
        )
        if (cancelled) return

        setConflicts(results.filter((r) => r.count > 0))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [graphEnabled, report, dismissedReports, getContradictions])

  if (!graphEnabled || !report || loading) return null
  if (dismissedReports.has(report.reportId)) return null
  if (conflicts.length === 0) return null

  const handleOpenEntity = (name: string) => {
    setRightSidebarOpen(true)
    setRightSidebarTab('entity')
    focusEntity(name)
  }

  const handleDismiss = () => {
    setDismissedReports((prev) => {
      const next = new Set(prev)
      next.add(report.reportId)
      return next
    })
  }

  const totalCount = conflicts.reduce((sum, c) => sum + c.count, 0)

  return (
    <div
      className="mx-auto mt-4 mb-2 max-w-[48rem] rounded-lg border flex items-start gap-2 p-3"
      style={{
        borderColor: 'var(--color-warning-border)',
        backgroundColor: 'var(--color-warning-bg)',
      }}
    >
      <AlertTriangle
        size={16}
        className="flex-shrink-0 mt-0.5"
        style={{ color: 'var(--color-warning)' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('contradictionBanner.title', {
            total: totalCount,
            entities: conflicts.length,
          })}
        </p>
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t('contradictionBanner.body')}
        </p>
        <div className="flex flex-wrap gap-1">
          {conflicts.slice(0, 8).map((c) => (
            <button
              key={c.entityName}
              onClick={() => handleOpenEntity(c.entityName)}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <span>{c.entityName}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                ×{c.count}
              </span>
              <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />
            </button>
          ))}
          {conflicts.length > 8 && (
            <span className="text-[11px] px-2 py-0.5" style={{ color: 'var(--text-muted)' }}>
              +{conflicts.length - 8}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
        title={t('contradictionBanner.dismiss')}
      >
        <X size={12} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  )
}
