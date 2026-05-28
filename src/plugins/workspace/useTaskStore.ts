import { create } from 'zustand'

export type TaskStatus = 'todo' | 'in-progress' | 'done'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  createdAt: number
  completedAt: number | null
}

const STORAGE_KEY = 'prismmd-tasks'

function load(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function save(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

interface TaskStore {
  tasks: Task[]
  addTask: (title: string) => void
  updateStatus: (id: string, status: TaskStatus) => void
  cycleStatus: (id: string) => void
  deleteTask: (id: string) => void
  getByStatus: (status: TaskStatus) => Task[]
  counts: () => { todo: number; inProgress: number; done: number }
  recentCompleted: (limit?: number) => Task[]
}

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  'todo': 'in-progress',
  'in-progress': 'done',
  'done': 'todo',
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: load(),

  addTask: (title) => {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      status: 'todo',
      createdAt: Date.now(),
      completedAt: null,
    }
    const updated = [task, ...get().tasks]
    save(updated)
    set({ tasks: updated })
  },

  updateStatus: (id, status) => {
    const updated = get().tasks.map((t) =>
      t.id === id ? { ...t, status, completedAt: status === 'done' ? Date.now() : null } : t,
    )
    save(updated)
    set({ tasks: updated })
  },

  cycleStatus: (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    get().updateStatus(id, STATUS_CYCLE[task.status])
  },

  deleteTask: (id) => {
    const updated = get().tasks.filter((t) => t.id !== id)
    save(updated)
    set({ tasks: updated })
  },

  getByStatus: (status) => get().tasks.filter((t) => t.status === status),

  counts: () => {
    const tasks = get().tasks
    return {
      todo: tasks.filter((t) => t.status === 'todo').length,
      inProgress: tasks.filter((t) => t.status === 'in-progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    }
  },

  recentCompleted: (limit = 5) =>
    get().tasks
      .filter((t) => t.status === 'done' && t.completedAt)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, limit),
}))
