import { create } from 'zustand'

export interface SessionSummary {
  id: string
  updatedAt: number
  turns: number
  state: string
  preview: string
  source: 'chat' | 'horse-mode'
}

interface SessionStore {
  /** Current active session ID. Null means no session (fresh start). */
  currentSessionId: string | null
  /** Cached list of session summaries for the sidebar/picker. */
  sessions: SessionSummary[]
  /** Whether a session operation is in progress. */
  loading: boolean

  /** Create a new session, set it as current, and return its ID. */
  createSession: () => Promise<string>
  /** Switch to an existing session. Returns the restored messages. */
  switchSession: (sessionId: string) => Promise<Array<{ role: string; content: string }> | null>
  /** Refresh the session list from disk. */
  refreshSessions: () => Promise<void>
  /** Delete (archive) a session. Switches to new session if it was the current one. */
  deleteSession: (sessionId: string) => Promise<void>
  /** Save messages to the current session. No-op if no session is active. */
  saveHistory: (messages: Array<{ role: string; content: string }>) => Promise<void>
  /** Set the current session ID without loading history (used during init). */
  setCurrentSessionId: (sessionId: string | null) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSessionId: null,
  sessions: [],
  loading: false,

  createSession: async () => {
    set({ loading: true })
    try {
      const sessionId = await window.electronAPI.sessionCreate()
      set({ currentSessionId: sessionId })
      await get().refreshSessions()
      return sessionId
    } finally {
      set({ loading: false })
    }
  },

  switchSession: async (sessionId) => {
    set({ loading: true })
    try {
      const result = await window.electronAPI.sessionRestore(sessionId)
      if (!result) return null
      set({ currentSessionId: sessionId })
      return result.messages
    } finally {
      set({ loading: false })
    }
  },

  refreshSessions: async () => {
    const sessions = await window.electronAPI.sessionList(50)
    set({ sessions })
  },

  deleteSession: async (sessionId) => {
    await window.electronAPI.sessionDelete(sessionId)
    const { currentSessionId } = get()
    if (currentSessionId === sessionId) {
      // Create a new session to replace the deleted one
      await get().createSession()
    }
    await get().refreshSessions()
  },

  saveHistory: async (messages) => {
    const { currentSessionId } = get()
    if (!currentSessionId) return
    // Only save user and assistant messages (filter out system/tool)
    const filtered = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))
    if (filtered.length === 0) return
    await window.electronAPI.sessionSaveHistory(currentSessionId, filtered)
  },

  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId })
  },
}))
