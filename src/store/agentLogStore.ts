import { create } from 'zustand'

export type LogLevel = 'info' | 'success' | 'error' | 'warning'
export type LogSource = 'horse-mode' | 'agent-chat' | 'graph-ingest' | 'editor-ai' | 'flashcard' | 'knowledge-base' | 'export' | 'system'

export interface AgentLogEntry {
  id: string
  timestamp: number
  source: LogSource
  message: string
  level: LogLevel
}

const MAX_ENTRIES = 200

interface AgentLogStore {
  entries: AgentLogEntry[]
  panelOpen: boolean

  log: (source: LogSource, message: string, level?: LogLevel) => void
  togglePanel: () => void
  clear: () => void
}

export const useAgentLogStore = create<AgentLogStore>((set) => ({
  entries: [],
  panelOpen: false,

  log: (source, message, level = 'info') => {
    const entry: AgentLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      source,
      message,
      level,
    }
    set((s) => ({
      entries: [...s.entries.slice(-(MAX_ENTRIES - 1)), entry],
    }))
  },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  clear: () => set({ entries: [] }),
}))
