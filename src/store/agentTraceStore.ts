import { create } from 'zustand'

export type TraceType = 'request' | 'system-prompt' | 'messages' | 'tools' | 'response' | 'tool-call' | 'error'

export interface TraceEntry {
  id: string
  timestamp: number
  type: TraceType
  label: string
  data: unknown
  durationMs?: number
}

const MAX_ENTRIES = 500

interface AgentTraceStore {
  entries: TraceEntry[]
  push: (entry: TraceEntry) => void
  clear: () => void
}

export const useAgentTraceStore = create<AgentTraceStore>((set) => ({
  entries: [],

  push: (entry) =>
    set((s) => ({
      entries: [...s.entries.slice(-(MAX_ENTRIES - 1)), entry],
    })),

  clear: () => set({ entries: [] }),
}))

/** Call once from a top-level useEffect to subscribe to IPC trace events. */
export function subscribeToTraceIPC(): () => void {
  return window.electronAPI.onAgentTrace((entry) => {
    useAgentTraceStore.getState().push(entry)
  })
}
