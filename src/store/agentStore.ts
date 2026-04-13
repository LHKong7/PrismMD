import { create } from 'zustand'
import type { AIProvider } from './settingsStore'
import { useSettingsStore } from './settingsStore'
import { useInsightGraphStore } from './insightGraphStore'

/**
 * A numbered citation attached to an assistant reply. The number matches
 * the bracketed marker the model was instructed to emit (e.g. `[2]`).
 * `text` is the evidence quote; `source` is an optional report id /
 * document label surfaced on hover.
 */
export interface CitationEvidence {
  index: number
  text: string
  source?: string
}

/**
 * Pull every `[N]` citation marker the model emitted out of the reply
 * so we only attach evidence entries that were actually cited.
 *
 * The regex is intentionally strict — we only accept 1–3 digit indexes
 * at word boundaries to avoid matching things like `array[0]` in code.
 */
const CITATION_MARKER_RE = /\[(\d{1,3})\]/g
function extractCitedIndexes(content: string): Set<number> {
  const out = new Set<number>()
  let m: RegExpExecArray | null
  while ((m = CITATION_MARKER_RE.exec(content)) !== null) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) out.add(n)
  }
  return out
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: AIProvider
  model?: string
  timestamp: number
  /** Evidence the model was instructed to cite (assistant messages only). */
  evidence?: CitationEvidence[]
}

interface AgentStore {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  /** Evidence staged for the in-flight reply; attached when the stream
   * finalizes. Reset on every new send. */
  pendingEvidence: CitationEvidence[]
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
  pendingEvidence: [],
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
    const { streamingContent, pendingEvidence } = get()
    if (streamingContent) {
      // Only attach evidence the model actually cited — keeps the
      // message lean and avoids leaking unused context into persisted
      // memory later.
      const citedIndexes = extractCitedIndexes(streamingContent)
      const attached = pendingEvidence.filter((e) => citedIndexes.has(e.index))
      get().addMessage({
        role: 'assistant',
        content: streamingContent,
        provider,
        model,
        ...(attached.length ? { evidence: attached } : {}),
      })
    }
    set({ isStreaming: false, streamingContent: '', pendingEvidence: [] })
  },

  clearMessages: () => set({ messages: [], streamingContent: '', pendingEvidence: [] }),

  toggleAgentSidebar: () => set((state) => ({ agentSidebarOpen: !state.agentSidebarOpen })),
  setAgentSidebarOpen: (open) => set({ agentSidebarOpen: open }),

  sendMessage: async (content, documentContext, currentFilePath) => {
    const { addMessage, setStreaming, appendStreamContent, finalizeStream } = get()

    addMessage({ role: 'user', content })
    setStreaming(true)
    set({ streamingContent: '', pendingEvidence: [] })

    try {
      // Gather memory context
      let memoryContext: string | undefined
      try {
        memoryContext = await window.electronAPI.memoryGetContext(currentFilePath, content) || undefined
      } catch {
        // Memory not available
      }

      // Gather knowledge-graph RAG context (optional, best-effort).
      // Evidence is numbered [1]..[N] so the model can cite specific
      // passages, and we stash the same numbered list on `pendingEvidence`
      // so the UI can render interactive superscripts after the reply
      // finalizes.
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
            const rawEvidence = Array.isArray(r.evidence) ? (r.evidence as unknown[]) : []
            const normalized: CitationEvidence[] = rawEvidence.slice(0, 5).map((e, idx) => {
              let text: string
              let source: string | undefined
              if (typeof e === 'string') {
                text = e
              } else if (e && typeof e === 'object') {
                const obj = e as Record<string, unknown>
                text = String(obj.text ?? obj.claim ?? obj.quote ?? JSON.stringify(obj))
                source =
                  (obj.source as string | undefined) ??
                  (obj.reportId as string | undefined) ??
                  (obj.report_id as string | undefined)
              } else {
                text = String(e)
              }
              return { index: idx + 1, text, source }
            })
            if (normalized.length > 0) {
              set({ pendingEvidence: normalized })
              const numbered = normalized
                .map((ev) => `[${ev.index}] ${ev.text}${ev.source ? ` — ${ev.source}` : ''}`)
                .join('\n')
              parts.push(
                [
                  'Evidence (cite by bracketed number in your answer, e.g. `…claim [1][3].`):',
                  numbered,
                ].join('\n'),
              )
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
