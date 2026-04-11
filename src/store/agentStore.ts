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
  ragIndexed: boolean
  ragDocCount: number

  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setStreaming: (isStreaming: boolean) => void
  appendStreamContent: (chunk: string) => void
  finalizeStream: (provider: AIProvider, model: string) => void
  clearMessages: () => void
  toggleAgentSidebar: () => void
  setAgentSidebarOpen: (open: boolean) => void

  // RAG
  indexWorkspace: (workspacePath: string) => Promise<void>
  setRagIndexed: (indexed: boolean) => void

  // Send with RAG + memory
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
  ragIndexed: false,
  ragDocCount: 0,

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

  // RAG
  indexWorkspace: async (workspacePath: string) => {
    try {
      const chunkCount = await window.electronAPI.indexWorkspace(workspacePath)
      const docCount = await window.electronAPI.ragGetDocCount()
      set({ ragIndexed: true, ragDocCount: docCount })
    } catch {
      set({ ragIndexed: false, ragDocCount: 0 })
    }
  },

  setRagIndexed: (indexed) => set({ ragIndexed: indexed }),

  sendMessage: async (content, documentContext, currentFilePath) => {
    const { addMessage, setStreaming, appendStreamContent, finalizeStream } = get()

    addMessage({ role: 'user', content })
    setStreaming(true)
    set({ streamingContent: '' })

    try {
      // Gather RAG context
      let ragContext: string | undefined
      if (get().ragIndexed) {
        ragContext = await window.electronAPI.ragRetrieve(content, 5, currentFilePath) || undefined
      }

      // Gather memory context
      let memoryContext: string | undefined
      try {
        memoryContext = await window.electronAPI.memoryGetContext(currentFilePath, content) || undefined
      } catch {
        // Memory not available
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
        ragContext,
        memoryContext,
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
