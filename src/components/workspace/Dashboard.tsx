import { FilePlus, Upload, Calendar, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useUIStore } from '../../store/uiStore'
import { useTaskStore } from '../../plugins/workspace/useTaskStore'
import { openTodayDiary } from '../../lib/workspace/diaryService'
import type { PageTreeNode } from '../../types/electron'

/**
 * Dashboard — the workspace "home" surface, styled to the Prism reading
 * instrument design: a Newsreader greeting, a quick-action grid, and a
 * two-column Recent + Today's tasks layout. Uses live workspace + task data.
 */

function flattenPages(nodes: PageTreeNode[], acc: PageTreeNode[] = []): PageTreeNode[] {
  for (const n of nodes) {
    // Folders are containers, not documents — keep them out of "Recent".
    if (!n.isFolder) acc.push(n)
    if (n.children?.length) flattenPages(n.children, acc)
  }
  return acc
}

export function Dashboard() {
  const { t } = useTranslation()
  const createPage = useWorkspaceStore((s) => s.createPage)
  const importFile = useWorkspaceStore((s) => s.importFile)
  const openPage = useWorkspaceStore((s) => s.openPage)
  const pageTree = useWorkspaceStore((s) => s.pageTree)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const counts = useTaskStore((s) => s.counts)()
  const todoTasks = useTaskStore((s) => s.getByStatus)('todo').slice(0, 5)

  const hour = new Date().getHours()
  const greeting = hour < 5 ? t('workspace.dashboard.night', 'Still up')
    : hour < 12 ? t('workspace.dashboard.morning', 'Good morning')
    : hour < 18 ? t('workspace.dashboard.afternoon', 'Good afternoon')
    : t('workspace.dashboard.evening', 'Good evening')
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  const recent = flattenPages(pageTree).slice(0, 6)

  const actions: { icon: typeof FilePlus; label: string; sub: string; onClick: () => void }[] = [
    { icon: FilePlus, label: t('sidebar.newPage', 'New page'), sub: t('workspace.dashboard.blankDoc', 'Blank document'), onClick: () => void createPage('Untitled', null) },
    { icon: Calendar, label: t('workspace.dashboard.dailyJournal', 'Daily journal'), sub: t('workspace.dashboard.journalSub', "Today's entry"), onClick: () => void openTodayDiary() },
    { icon: Upload, label: t('sidebar.importFile', 'Import file'), sub: t('workspace.dashboard.importSub', 'Bring a file in'), onClick: () => void importFile(null) },
    { icon: Search, label: t('commandPalette.title', 'Search'), sub: '⌘P', onClick: () => setCommandPaletteOpen(true) },
  ]

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto px-10 py-16" style={{ maxWidth: 860 }}>
        {/* Greeting */}
        <div className="text-[13px] mb-1.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', letterSpacing: '.04em' }}>{today}</div>
        <h1 className="mb-8" style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 38, lineHeight: 1.1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
          {greeting}.
        </h1>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-9">
          {actions.map(({ icon: Icon, label, sub, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex flex-col gap-2 p-4 rounded-xl border text-left transition-all hover:-translate-y-0.5"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
            >
              <Icon size={20} style={{ color: 'var(--accent-color)' }} />
              <div>
                <div className="text-[13.5px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{label}</div>
                <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Recent + tasks */}
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6">
          {/* Recent pages */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.dashboard.recent', 'Recent')}
            </div>
            {recent.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {recent.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void openPage(p.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                  >
                    <span className="text-lg shrink-0">{p.icon || '📄'}</span>
                    <span className="flex-1 truncate text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
                      {p.title || t('pagetree.untitled', 'Untitled')}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>{t('sidebar.noPages', 'No pages yet')}</p>
            )}
          </div>

          {/* Today's tasks */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.dashboard.todayTasks', "Today's tasks")} · {counts.done}/{counts.todo + counts.inProgress + counts.done}
            </div>
            <div className="rounded-xl border p-2" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
              {todoTasks.length > 0 ? (
                todoTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2.5 px-2.5 py-2 text-[13px]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>○</span>
                    <span className="truncate">{task.title}</span>
                  </div>
                ))
              ) : (
                <div className="px-2.5 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  {t('workspace.dashboard.noTasks', 'Nothing due — enjoy the quiet.')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
