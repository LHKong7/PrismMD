import { create } from 'zustand'
import type { SupportedLanguage } from '../i18n'

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom'

export interface AIProviderConfig {
  apiKey: string
  model: string
  enabled: boolean
  baseUrl?: string // For Ollama / LM Studio custom endpoints
}

export type InsightGraphDomain = 'default' | 'stock_analysis' | 'restaurant_analysis'

export interface InsightGraphConfig {
  enabled: boolean
  neo4j: {
    uri: string
    user: string
    password: string
  }
  domain: InsightGraphDomain
  /**
   * When true, the reader post-processes rendered markdown to wrap known
   * entity names with clickable spans. Opt-in because it costs a DOM
   * walk + trie build per document open.
   */
  entityLinking: boolean
}

export const DEFAULT_INSIGHT_GRAPH_CONFIG: InsightGraphConfig = {
  enabled: false,
  neo4j: {
    uri: 'bolt://localhost:7687',
    user: 'neo4j',
    password: '',
  },
  domain: 'default',
  entityLinking: false,
}

export interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
  enabled?: boolean
}

export interface McpConfig {
  enabled: boolean
  servers: Record<string, McpServerConfig>
  toolTimeoutMs: number
}

export const DEFAULT_MCP_CONFIG: McpConfig = {
  enabled: false,
  servers: {},
  toolTimeoutMs: 30_000,
}

export const DEFAULT_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
  ollama: ['llama3', 'llama3:70b', 'qwen2', 'qwen2:72b', 'mistral', 'codellama', 'gemma2'],
  custom: [],
}

interface SettingsStore {
  // Language
  language: SupportedLanguage

  // Theme
  themeId: string
  themeMode: 'manual' | 'system'
  vibrancy: boolean
  wordWrap: boolean
  editorFontSize: number
  fontFamily: string
  /** Rich edit mode — styled markdown tokens in editor (headings large, bold bold, etc.) */
  richEditMode: boolean

  // Privacy
  privacyMode: boolean // When true, block all external API calls - local LLM only

  // AI providers
  providers: Record<AIProvider, AIProviderConfig>
  activeProvider: AIProvider | null

  // Focus mode
  focusMode: boolean

  // InsightGraph (optional RAG over a Neo4j knowledge graph)
  insightGraph: InsightGraphConfig

  // MCP (Model Context Protocol) — tool servers the agent can call
  mcp: McpConfig

  // Actions
  setLanguage: (lang: SupportedLanguage) => void
  setThemeId: (id: string) => void
  setThemeMode: (mode: 'manual' | 'system') => void
  setVibrancy: (enabled: boolean) => void
  setWordWrap: (enabled: boolean) => void
  setEditorFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setRichEditMode: (enabled: boolean) => void
  setPrivacyMode: (enabled: boolean) => void
  setProviderConfig: (provider: AIProvider, config: Partial<AIProviderConfig>) => void
  setActiveProvider: (provider: AIProvider | null) => void
  setFocusMode: (enabled: boolean) => void
  setInsightGraphConfig: (config: Partial<InsightGraphConfig> & { neo4j?: Partial<InsightGraphConfig['neo4j']> }) => void
  setMcpConfig: (config: Partial<McpConfig>) => void
  setMcpServer: (id: string, config: McpServerConfig | null) => void

  // Persistence
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  language: 'en',
  themeId: 'parchment',
  themeMode: 'manual',
  vibrancy: false,
  wordWrap: true,
  editorFontSize: 14,
  fontFamily: '',
  richEditMode: true,
  privacyMode: false,
  focusMode: false,
  insightGraph: DEFAULT_INSIGHT_GRAPH_CONFIG,
  mcp: DEFAULT_MCP_CONFIG,

  providers: {
    openai: { apiKey: '', model: 'gpt-4o', enabled: false },
    anthropic: { apiKey: '', model: 'claude-sonnet-4-20250514', enabled: false },
    google: { apiKey: '', model: 'gemini-1.5-pro', enabled: false },
    ollama: { apiKey: 'ollama', model: 'llama3', enabled: false, baseUrl: 'http://localhost:11434' },
    custom: { apiKey: '', model: '', enabled: false, baseUrl: '' },
  },
  activeProvider: null,

  setLanguage: (language) => {
    set({ language })
    get().saveSettings()
  },

  setThemeId: (themeId) => {
    set({ themeId })
    get().saveSettings()
  },

  setThemeMode: (themeMode) => {
    set({ themeMode })
    get().saveSettings()
  },

  setVibrancy: (vibrancy) => {
    set({ vibrancy })
    get().saveSettings()
  },

  setWordWrap: (wordWrap) => {
    set({ wordWrap })
    get().saveSettings()
  },

  setEditorFontSize: (editorFontSize) => {
    const clamped = Math.max(10, Math.min(28, editorFontSize))
    set({ editorFontSize: clamped })
    get().saveSettings()
  },

  setFontFamily: (fontFamily) => {
    set({ fontFamily })
    // Apply immediately as CSS variable override
    if (fontFamily) {
      document.documentElement.style.setProperty('--font-body', fontFamily)
    } else {
      // Empty = use theme default; remove override so theme's value takes effect
      document.documentElement.style.removeProperty('--font-body')
    }
    get().saveSettings()
  },

  setRichEditMode: (richEditMode) => {
    set({ richEditMode })
    get().saveSettings()
  },

  setPrivacyMode: (privacyMode) => {
    set({ privacyMode })
    // When enabling privacy mode, force switch to local provider if available
    if (privacyMode) {
      const { providers } = get()
      if (providers.ollama.enabled || providers.ollama.baseUrl) {
        set({ activeProvider: 'ollama' })
      }
    }
    get().saveSettings()
  },

  setProviderConfig: (provider, config) => {
    set((state) => ({
      providers: {
        ...state.providers,
        [provider]: { ...state.providers[provider], ...config },
      },
    }))
    get().saveSettings()
  },

  setActiveProvider: (activeProvider) => {
    const { privacyMode } = get()
    // In privacy mode, only allow local providers
    if (privacyMode && activeProvider && activeProvider !== 'ollama') {
      return
    }
    set({ activeProvider })
    get().saveSettings()
  },

  setFocusMode: (focusMode) => set({ focusMode }),

  setInsightGraphConfig: (config) => {
    set((state) => ({
      insightGraph: {
        ...state.insightGraph,
        ...config,
        neo4j: {
          ...state.insightGraph.neo4j,
          ...(config.neo4j ?? {}),
        },
      },
    }))
    get().saveSettings()
  },

  setMcpConfig: (config) => {
    set((state) => ({ mcp: { ...state.mcp, ...config } }))
    get().saveSettings()
    // Ask main to restart its pool so the change takes effect immediately.
    void window.electronAPI.mcpRestart()
  },

  setMcpServer: (id, config) => {
    set((state) => {
      const servers = { ...state.mcp.servers }
      if (config === null) delete servers[id]
      else servers[id] = config
      return { mcp: { ...state.mcp, servers } }
    })
    get().saveSettings()
    void window.electronAPI.mcpRestart()
  },

  loadSettings: async () => {
    try {
      const raw = await window.electronAPI.loadSettings()
      if (raw) {
        const s = raw as Record<string, unknown>
        set({
          language: (s.language as SupportedLanguage) ?? 'en',
          themeId: (s.themeId as string) ?? 'parchment',
          themeMode: (s.themeMode as 'manual' | 'system') ?? 'manual',
          vibrancy: (s.vibrancy as boolean) ?? false,
          wordWrap: (s.wordWrap as boolean) ?? true,
          editorFontSize: (s.editorFontSize as number) ?? 14,
          fontFamily: (s.fontFamily as string) ?? '',
          richEditMode: (s.richEditMode as boolean) ?? true,
          privacyMode: (s.privacyMode as boolean) ?? false,
          providers: { ...get().providers, ...(s.providers as Record<AIProvider, AIProviderConfig>) },
          activeProvider: (s.activeProvider as AIProvider | null) ?? null,
          insightGraph: {
            ...DEFAULT_INSIGHT_GRAPH_CONFIG,
            ...((s.insightGraph as Partial<InsightGraphConfig>) ?? {}),
            neo4j: {
              ...DEFAULT_INSIGHT_GRAPH_CONFIG.neo4j,
              ...(((s.insightGraph as Partial<InsightGraphConfig>)?.neo4j) ?? {}),
            },
          },
          mcp: {
            ...DEFAULT_MCP_CONFIG,
            ...((s.mcp as Partial<McpConfig>) ?? {}),
            servers: {
              ...(((s.mcp as Partial<McpConfig>)?.servers) ?? {}),
            },
          },
        })
        // Apply font override if user has a custom selection
        const ff = get().fontFamily
        if (ff) {
          document.documentElement.style.setProperty('--font-body', ff)
        }
      }
    } catch {
      // Use defaults
    }
  },

  saveSettings: async () => {
    const { language, themeId, themeMode, vibrancy, wordWrap, editorFontSize, fontFamily, richEditMode, privacyMode, providers, activeProvider, insightGraph, mcp } = get()
    try {
      await window.electronAPI.saveSettings({
        language, themeId, themeMode, vibrancy, wordWrap, editorFontSize, fontFamily, richEditMode, privacyMode, providers, activeProvider, insightGraph, mcp,
      })
    } catch {
      // Silently fail
    }
  },
}))
