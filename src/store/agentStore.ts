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
  /**
   * `'error'` assistant messages render with an error style and a retry
   * button — see ChatMessage.tsx. We track the exact user prompt that
   * produced the error so retry can re-send it without rebuilding the
   * history.
   */
  status?: 'ok' | 'error'
  errorRetryPrompt?: string
}

interface AgentStore {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  /** Evidence staged for the in-flight reply; attached when the stream
   * finalizes. Reset on every new send. */
  pendingEvidence: CitationEvidence[]
  agentSidebarOpen: boolean
  /**
   * Non-blocking warning from the main process (e.g. MCP tools couldn't
   * be attached). Shown as a dismissible banner in AgentSidebar — null
   * hides it. The store, not the component, owns this so the warning
   * survives the component unmounting/remounting across tabs.
   */
  mcpWarning: string | null
  dismissMcpWarning: () => void

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
  /** Re-send a previously failed user prompt (powers the Retry button). */
  retryMessage: (messageId: string, documentContext?: string, currentFilePath?: string) => Promise<void>

  // Memory
  saveConversationMemory: (filePath: string) => Promise<void>
}

/**
 * Install global listeners for main-process events the store cares about.
 * Run once at module load — these are process-wide and never detach
 * (the BrowserWindow owns its own lifetime; when it goes away, so does
 * this renderer).
 */
let globalListenersBound = false
function bindGlobalAgentListeners(
  set: (partial: Partial<AgentStore> | ((s: AgentStore) => Partial<AgentStore>)) => void,
  get: () => AgentStore,
) {
  if (globalListenersBound) return
  if (typeof window === 'undefined' || !window.electronAPI) return
  globalListenersBound = true

  const api = window.electronAPI
  api.onAgentStreamError?.((message) => {
    // Promote any in-flight streamed partial into the message list so
    // the user still sees what the model had time to produce, then
    // stamp on an error message underneath with a retry affordance.
    const { streamingContent, messages, addMessage } = get()
    // The most recent user message is the prompt we want to retry.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const retryPrompt = lastUser?.content
    if (streamingContent) {
      addMessage({ role: 'assistant', content: streamingContent })
    }
    set({ isStreaming: false, streamingContent: '', pendingEvidence: [] })
    addMessage({
      role: 'assistant',
      content: message || 'An error occurred.',
      status: 'error',
      ...(retryPrompt ? { errorRetryPrompt: retryPrompt } : {}),
    })
  })
  api.onAgentMcpWarning?.((message) => {
    set({ mcpWarning: message })
  })
}

export const useAgentStore = create<AgentStore>((set, get) => {
  // Side effect at store creation — installs once per renderer.
  bindGlobalAgentListeners(set as Parameters<typeof bindGlobalAgentListeners>[0], get)

  return {
  messages: [],
  isStreaming: false,
  streamingContent: '',
  pendingEvidence: [],
  agentSidebarOpen: false,
  mcpWarning: null,
  dismissMcpWarning: () => set({ mcpWarning: null }),

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
      // Note: streaming errors raised through the `agent:stream-error`
      // IPC event are handled in bindGlobalAgentListeners (and include
      // retry metadata). This catch only fires for failures before the
      // stream starts (setup, IPC round-trip). We still attach a retry
      // prompt so the user isn't stranded.
      addMessage({
        role: 'assistant',
        content: err instanceof Error ? err.message : 'An error occurred.',
        status: 'error',
        errorRetryPrompt: content,
      })
    }
  },

  stopGeneration: () => {
    window.electronAPI.stopAgentGeneration?.()
    const { finalizeStream } = get()
    finalizeStream('openai', '')
  },

  retryMessage: async (messageId, documentContext, currentFilePath) => {
    const { messages, sendMessage } = get()
    const msg = messages.find((m) => m.id === messageId)
    const prompt = msg?.errorRetryPrompt
    if (!prompt) return
    // Drop the failed assistant message before retrying so we don't
    // accumulate duplicate error bubbles in the transcript. Also drop
    // the user turn that produced it — sendMessage will re-add both.
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId)
      if (idx < 0) return {}
      // Remove the error bubble and the user message immediately above
      // it (if any) to keep the flow clean.
      const next = state.messages.slice(0, idx)
      if (next.length && next[next.length - 1].role === 'user' && next[next.length - 1].content === prompt) {
        next.pop()
      }
      return { messages: next }
    })
    await sendMessage(prompt, documentContext, currentFilePath)
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
  }
})
