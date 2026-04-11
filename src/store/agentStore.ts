import { create } from 'zustand'
import type { AIProvider } from './settingsStore'

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

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setStreaming: (isStreaming: boolean) => void
  appendStreamContent: (chunk: string) => void
  finalizeStream: (provider: AIProvider, model: string) => void
  clearMessages: () => void
  toggleAgentSidebar: () => void
  setAgentSidebarOpen: (open: boolean) => void

  // Send message to AI
  sendMessage: (content: string, documentContext?: string) => Promise<void>
  stopGeneration: () => void
}

let abortController: AbortController | null = null

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
      get().addMessage({
        role: 'assistant',
        content: streamingContent,
        provider,
        model,
      })
    }
    set({ isStreaming: false, streamingContent: '' })
  },

  clearMessages: () => set({ messages: [], streamingContent: '' }),

  toggleAgentSidebar: () => {
    set((state) => ({ agentSidebarOpen: !state.agentSidebarOpen }))
  },

  setAgentSidebarOpen: (open) => set({ agentSidebarOpen: open }),

  sendMessage: async (content, documentContext) => {
    const { addMessage, setStreaming, appendStreamContent, finalizeStream } = get()

    // Add user message
    addMessage({ role: 'user', content })

    setStreaming(true)
    set({ streamingContent: '' })

    abortController = new AbortController()

    try {
      // Build message history for context
      const history = get().messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }))

      // Start streaming via IPC
      const cleanup = window.electronAPI.onAgentStream((chunk: string) => {
        appendStreamContent(chunk)
      })

      const result = await window.electronAPI.sendAgentMessage({
        messages: history,
        documentContext: documentContext ?? undefined,
      })

      cleanup()
      finalizeStream(result.provider as AIProvider, result.model)
    } catch (err) {
      set({ isStreaming: false, streamingContent: '' })
      addMessage({
        role: 'assistant',
        content: err instanceof Error ? err.message : 'An error occurred.',
      })
    }

    abortController = null
  },

  stopGeneration: () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    window.electronAPI.stopAgentGeneration?.()
    const { finalizeStream } = get()
    finalizeStream('openai', '')
  },
}))
