import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { usePaneFileData } from '../../hooks/usePaneFileData'

interface Crumb {
  id: string
  title: string
  icon: string | null
}

/**
 * Breadcrumb — shows the ancestor chain of the current page
 * (root → … → current). Clicking an ancestor opens it.
 */
export function Breadcrumb() {
  const { filePath: currentPageId } = usePaneFileData()
  const openPage = useWorkspaceStore((s) => s.openPage)
  const [crumbs, setCrumbs] = useState<Crumb[]>([])

  useEffect(() => {
    if (!currentPageId) {
      setCrumbs([])
      return
    }
    let cancelled = false
    window.electronAPI.workspaceGetAncestors(currentPageId)
      .then((ancestors) => {
        if (!cancelled) setCrumbs(ancestors.map((a) => ({ id: a.id, title: a.title, icon: a.icon })))
      })
      .catch(() => { if (!cancelled) setCrumbs([]) })
    return () => { cancelled = true }
  }, [currentPageId])

  if (!currentPageId || crumbs.length === 0) return null

  return (
    <div
      className="group flex items-center gap-1.5 px-3.5 shrink-0 overflow-hidden"
      style={{
        height: 30,
        fontFamily: 'var(--font-ui)',
        fontSize: 12.5,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--line-soft, var(--border-color))',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {crumbs.map((seg, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={seg.id} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span className="shrink-0 opacity-50 select-none">/</span>}
            {seg.icon && <span className="shrink-0">{seg.icon}</span>}
            {isLast ? (
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
                {seg.title || 'Untitled'}
              </span>
            ) : (
              <button
                onClick={() => void openPage(seg.id)}
                className="truncate hover:underline"
                style={{ color: 'var(--text-muted)' }}
              >
                {seg.title || 'Untitled'}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
