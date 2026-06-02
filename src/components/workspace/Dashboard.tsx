import { BookOpen, FilePlus, Upload, Calendar, CheckSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useTaskStore } from '../../plugins/workspace/useTaskStore'
import { openTodayDiary } from '../../lib/workspace/diaryService'
import { Button } from '../ui/Button'

export function Dashboard() {
  const { t } = useTranslation()
  const createPage = useWorkspaceStore((s) => s.createPage)
  const importFile = useWorkspaceStore((s) => s.importFile)
  const counts = useTaskStore((s) => s.counts)()
  const recentCompleted = useTaskStore((s) => s.recentCompleted)(3)
  const todoTasks = useTaskStore((s) => s.getByStatus)('todo').slice(0, 3)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('workspace.dashboard.morning', 'Good morning') : hour < 18 ? t('workspace.dashboard.afternoon', 'Good afternoon') : t('workspace.dashboard.evening', 'Good evening')
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{greeting}!</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{today}</p>
          </div>
          <BookOpen size={32} style={{ color: 'var(--accent-color)', opacity: 0.3 }} />
        </div>

        {/* Top row: Diary + Tasks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Today's Diary */}
          <div
            className="rounded-xl border p-5 cursor-pointer transition-colors hover:border-[var(--accent-color)]"
            style={{ borderColor: 'var(--border-color)' }}
            onClick={() => void openTodayDiary()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} style={{ color: 'var(--accent-color)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('workspace.dashboard.todayDiary', "Today's Diary")}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('workspace.dashboard.diaryHint', 'Click to open or create today\'s journal entry.')}
            </p>
          </div>

          {/* Tasks Summary */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={16} style={{ color: 'var(--color-success)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('workspace.dashboard.tasks', 'Tasks')}
              </span>
            </div>
            <div className="flex gap-3 text-xs mb-3">
              <span style={{ color: 'var(--text-muted)' }}>{counts.todo} to do</span>
              <span style={{ color: 'var(--color-warning)' }}>{counts.inProgress} doing</span>
              <span style={{ color: 'var(--color-success)' }}>{counts.done} done</span>
            </div>
            {todoTasks.length > 0 && (
              <div className="space-y-1">
                {todoTasks.map((task) => (
                  <div key={task.id} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>○</span>
                    <span className="truncate">{task.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            {t('workspace.dashboard.quickActions', 'Quick Actions')}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void createPage('Untitled', null)} className="text-xs">
              <FilePlus size={13} /> {t('sidebar.newPage', 'New page')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void importFile(null)} className="text-xs">
              <Upload size={13} /> {t('sidebar.importFile', 'Import Markdown')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openTodayDiary()} className="text-xs">
              <Calendar size={13} /> {t('workspace.dashboard.diary', 'Diary')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
