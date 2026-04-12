import { create } from 'zustand'
import type { AIProvider } from './settingsStore'
import { useSettingsStore } from './settingsStore'
import { useInsightGraphStore } from './insightGraphStore'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: AIProvider
  model?: string
  timestamp: number
}

interface AgentStore {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  agentSidebarOpen: boolean

  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setStreaming: (isStreaming: boolean) => void
  appendStreamContent: (chunk: string) => void
  finalizeStream: (provider: AIProvider, model: string) => void
  clearMessages: () => void
  toggleAgentSidebar: () => void
  setAgentSidebarOpen: (open: boolean) => void

  // Send with memory
  sendMessage: (content: string, documentContext?: string, currentFilePath?: string) => Promise<void>
  stopGeneration: () => void

  // Memory
  saveConversationMemory: (filePath: string) => Promise<void>
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  agentSidebarOpen: false,

  addMessage: (message) => {
    const newMsg: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, newMsg] }))
  },

  setStreaming: (isStreaming) => set({ isStreaming }),

  appendStreamContent: (chunk) => {
    set((state) => ({ streamingContent: state.streamingContent + chunk }))
  },

  finalizeStream: (provider, model) => {
    const { streamingContent } = get()
    if (streamingContent) {
      get().addMessage({ role: 'assistant', content: streamingContent, provider, model })
    }
    set({ isStreaming: false, streamingContent: '' })
  },

  clearMessages: () => set({ messages: [], streamingContent: '' }),

  toggleAgentSidebar: () => set((state) => ({ agentSidebarOpen: !state.agentSidebarOpen })),
  setAgentSidebarOpen: (open) => set({ agentSidebarOpen: open }),

  sendMessage: async (content, documentContext, currentFilePath) => {
    const { addMessage, setStreaming, appendStreamContent, finalizeStream } = get()

    addMessage({ role: 'user', content })
    setStreaming(true)
    set({ streamingContent: '' })

    try {
      // Gather memory context
      let memoryContext: string | undefined
      try {
        memoryContext = await window.electronAPI.memoryGetContext(currentFilePath, content) || undefined
      } catch {
        // Memory not available
      }

      // Gather knowledge-graph RAG context (optional, best-effort)
      let graphContext: string | undefined
      const graphEnabled = useSettingsStore.getState().insightGraph.enabled
      if (graphEnabled) {
        try {
          const sessionId = await useInsightGraphStore.getState().ensureSession()
          const res = await window.electronAPI.insightGraphQuery(content, sessionId ?? undefined)
          if (res.ok) {
            const r = res.result as Record<string, unknown>
            const parts: string[] = []
            if (r.answer) parts.push(`Answer: ${String(r.answer)}`)
            if (Array.isArray(r.keyFindings) && r.keyFindings.length) {
              parts.push(`Key findings:\n- ${(r.keyFindings as unknown[]).map((f) => String(f)).join('\n- ')}`)
            }
            if (Array.isArray(r.evidence) && r.evidence.length) {
              const ev = (r.evidence as unknown[])
                .slice(0, 5)
                .map((e) => {
                  if (typeof e === 'string') return e
                  if (e && typeof e === 'object') {
                    const obj = e as Record<string, unknown>
                    return String(obj.text ?? obj.claim ?? JSON.stringify(obj))
                  }
                  return String(e)
                })
                .join('\n- ')
              parts.push(`Evidence:\n- ${ev}`)
            }
            if (r.confidence !== undefined) parts.push(`Confidence: ${String(r.confidence)}`)
            if (parts.length) graphContext = parts.join('\n\n')
          }
        } catch {
          // Graph RAG best-effort — don't block chat.
        }
      }

      // Build message history
      const history = get().messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }))

      const cleanup = window.electronAPI.onAgentStream((chunk: string) => {
        appendStreamContent(chunk)
      })

      const result = await window.electronAPI.sendAgentMessage({
        messages: history,
        documentContext: documentContext ?? undefined,
        memoryContext,
        graphContext,
      })

      cleanup()
      finalizeStream(result.provider as AIProvider, result.model)

      // Save to memory after successful conversation
      if (currentFilePath) {
        get().saveConversationMemory(currentFilePath)
      }
    } catch (err) {
      set({ isStreaming: false, streamingContent: '' })
      addMessage({
        role: 'assistant',
        content: err instanceof Error ? err.message : 'An error occurred.',
      })
    }
  },

  stopGeneration: () => {
    window.electronAPI.stopAgentGeneration?.()
    const { finalizeStream } = get()
    finalizeStream('openai', '')
  },

  saveConversationMemory: async (filePath: string) => {
    const { messages } = get()
    if (messages.length < 2) return

    try {
      const { summary, topics } = await window.electronAPI.memoryExtractSummary(
        messages.map((m) => ({ role: m.role, content: m.content }))
      )
      if (summary) {
        await window.electronAPI.memorySave(filePath, summary, topics)
      }
    } catch {
      // Memory save failed silently
    }
  },
}))
