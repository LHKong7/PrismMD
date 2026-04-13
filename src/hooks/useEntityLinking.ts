import { useEffect } from 'react'
import { useFileStore } from '../store/fileStore'
import { useSettingsStore } from '../store/settingsStore'
import { useUIStore } from '../store/uiStore'
import { useInsightGraphStore } from '../store/insightGraphStore'
import { highlightEntitiesIn } from '../lib/graph/entityHighlighter'

/**
 * Installs entity-highlight spans inside the given markdown container
 * whenever the Knowledge Graph is enabled AND the user has turned entity
 * linking on in Settings. Re-runs on every document swap and detaches
 * cleanly when the flag flips off.
 *
 * Performance notes:
 *  - Building the trie and walking text nodes is O(n) in document size;
 *    the setTimeout(0) defers it past paint so the reader never feels
 *    jittery.
 *  - We source entity names from (in order of preference) the report's
 *    entities, the cached graph entities, or a best-effort
 *    `findEntities({ limit: 200 })` call.
 */
export function useEntityLinking(containerRef: React.RefObject<HTMLElement>) {
  const graphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const entityLinking = useSettingsStore((s) => s.insightGraph.entityLinking)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const currentContent = useFileStore((s) => s.currentContent)
  const reports = useInsightGraphStore((s) => s.reports)
  const findEntities = useInsightGraphStore((s) => s.findEntities)
  const focusEntity = useUIStore((s) => s.focusEntity)

  useEffect(() => {
    if (!graphEnabled || !entityLinking) return
    const el = containerRef.current
    if (!el || !currentFilePath) return

    let disposer: (() => void) | null = null
    let cancelled = false

    const run = async () => {
      // Prefer a report-scoped entity list when we have the mapping —
      // avoids highlighting names that don't actually appear in this
      // document's source. Fall back to the global top-200 when the file
      // hasn't been ingested yet.
      let names: string[] = []
      const report = reports.find((r) => r.filePath === currentFilePath)
      if (report) {
        const res = await window.electronAPI.insightGraphEntitiesForReport(report.reportId)
        if (res.ok) names = res.data
      }
      if (names.length === 0) {
        const entities = await findEntities({ limit: 200 })
        names = entities.map((e) => e.name).filter(Boolean)
      }
      if (cancelled) return
      if (names.length === 0) return

      disposer = highlightEntitiesIn(el, names, {
        onEntityClick: (name) => focusEntity(name),
      })
    }

    const timer = window.setTimeout(run, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      disposer?.()
    }
  }, [
    graphEnabled,
    entityLinking,
    currentFilePath,
    // Re-run when the rendered content actually changes so new DOM gets
    // processed.
    currentContent,
    reports,
    containerRef,
    findEntities,
    focusEntity,
  ])
}
