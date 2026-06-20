import { useState } from 'react'
import { Plus, Trash2, Circle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, type Task, type TaskStatus } from './useTaskStore'

const STATUS_ICON: Record<TaskStatus, typeof Circle> = {
  'todo': Circle,
  'in-progress': ArrowRight,
  'done': CheckCircle2,
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  'todo': 'var(--text-muted)',
  'in-progress': 'var(--color-warning)',
  'done': 'var(--color-success)',
}

export function TaskPanel() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const cycleStatus = useTaskStore((s) => s.cycleStatus)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const counts = useTaskStore((s) => s.counts)()

  const [input, setInput] = useState('')
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')

  const handleAdd = () => {
    if (!input.trim()) return
    addTask(input.trim())
    setInput('')
  }

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  return (
    <div className="flex flex-col h-full">
      {/* Add task */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder={t('workspace.tasks.addPlaceholder', 'Add a task...')}
            className="flex-1 text-xs px-2 py-1.5 rounded border outline-none"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={handleAdd}
            className="p-1.5 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: 'var(--accent-color)' }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex px-3 py-1.5 gap-1 border-b" style={{ borderColor: 'var(--border-color)' }}>
        {(['all', 'todo', 'in-progress', 'done'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: filter === s ? 'var(--accent-color)' : 'transparent',
              color: filter === s ? 'var(--accent-ink, #fff)' : 'var(--text-muted)',
            }}
          >
            {s === 'all' ? `All (${tasks.length})` : s === 'todo' ? `To Do (${counts.todo})` : s === 'in-progress' ? `Doing (${counts.inProgress})` : `Done (${counts.done})`}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filtered.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
            {t('workspace.tasks.empty', 'No tasks yet.')}
          </p>
        )}
        {filtered.map((task) => (
          <TaskItem key={task.id} task={task} onCycle={cycleStatus} onDelete={deleteTask} />
        ))}
      </div>
    </div>
  )
}

function TaskItem({ task, onCycle, onDelete }: { task: Task; onCycle: (id: string) => void; onDelete: (id: string) => void }) {
  const Icon = STATUS_ICON[task.status]
  const color = STATUS_COLOR[task.status]

  return (
    <div className="group flex items-start gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: 'var(--border-color)' }}>
      <button
        onClick={() => onCycle(task.id)}
        className="mt-0.5 flex-shrink-0 transition-colors hover:opacity-70"
        title={`Status: ${task.status} (click to change)`}
      >
        <Icon size={14} style={{ color }} />
      </button>
      <span
        className="flex-1 text-xs break-words"
        style={{
          color: task.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
        }}
      >
        {task.title}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10 dark:hover:bg-white/10"
      >
        <Trash2 size={11} style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  )
}
