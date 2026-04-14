import Store from 'electron-store'

interface ProviderConfig {
  apiKey: string
  model: string
  enabled: boolean
  baseUrl?: string
}

export interface InsightGraphSettings {
  enabled: boolean
  neo4j: {
    uri: string
    user: string
    password: string
  }
  domain: 'default' | 'stock_analysis' | 'restaurant_analysis'
  entityLinking?: boolean
}

/**
 * MCP (Model Context Protocol) servers that expose tools to the AI
 * assistant. Shape mirrors Claude Desktop's `mcpServers` config so
 * users can paste existing configs directly.
 */
export interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
  /** Soft-disabled entries stay configured but aren't started. */
  enabled?: boolean
}

export interface McpSettings {
  enabled: boolean
  servers: Record<string, McpServerConfig>
  /** Max milliseconds a single tool call may run. Defaults to 30s. */
  toolTimeoutMs: number
}

interface AppSettings {
  language: string
  themeId: string
  themeMode: string
  vibrancy: boolean
  privacyMode: boolean
  providers: Record<string, ProviderConfig>
  activeProvider: string | null
  insightGraph: InsightGraphSettings
  mcp: McpSettings
}

const DEFAULT_INSIGHT_GRAPH: InsightGraphSettings = {
  enabled: false,
  neo4j: {
    uri: 'bolt://localhost:7687',
    user: 'neo4j',
    password: '',
  },
  domain: 'default',
  entityLinking: false,
}

const DEFAULT_MCP: McpSettings = {
  enabled: false,
  servers: {},
  toolTimeoutMs: 30_000,
}

const store = new Store<{ settings: AppSettings }>({
  name: 'prismmd-settings',
  defaults: {
    settings: {
      language: 'en',
      themeId: 'light',
      themeMode: 'system',
      vibrancy: false,
      privacyMode: false,
      providers: {
        openai: { apiKey: '', model: 'gpt-4o', enabled: false },
        anthropic: { apiKey: '', model: 'claude-sonnet-4-20250514', enabled: false },
        google: { apiKey: '', model: 'gemini-1.5-pro', enabled: false },
        ollama: { apiKey: 'ollama', model: 'llama3', enabled: false, baseUrl: 'http://localhost:11434' },
        custom: { apiKey: '', model: '', enabled: false, baseUrl: '' },
      },
      activeProvider: null,
      insightGraph: DEFAULT_INSIGHT_GRAPH,
      mcp: DEFAULT_MCP,
    },
  },
})

export function loadSettings(): AppSettings {
  const s = store.get('settings')
  // Defensive merge so older persisted settings don't crash on new fields.
  return {
    ...s,
    insightGraph: {
      ...DEFAULT_INSIGHT_GRAPH,
      ...(s.insightGraph ?? {}),
      neo4j: {
        ...DEFAULT_INSIGHT_GRAPH.neo4j,
        ...(s.insightGraph?.neo4j ?? {}),
      },
    },
    mcp: {
      ...DEFAULT_MCP,
      ...(s.mcp ?? {}),
      servers: { ...(s.mcp?.servers ?? {}) },
    },
  }
}

export function getInsightGraphSettings(): InsightGraphSettings {
  return loadSettings().insightGraph
}

export function getMcpSettings(): McpSettings {
  return loadSettings().mcp
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}

export function getApiKey(provider: string): string {
  const settings = loadSettings()
  return settings.providers?.[provider]?.apiKey ?? ''
}

export function getActiveProvider(): {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
} | null {
  const settings = loadSettings()
  const provider = settings.activeProvider
  if (!provider) return null

  const config = settings.providers?.[provider]
  if (!config) return null

  // Ollama doesn't need a traditional API key
  if (provider === 'ollama') {
    return { provider, model: config.model, apiKey: 'ollama', baseUrl: config.baseUrl }
  }

  if (!config.apiKey) return null
  return { provider, model: config.model, apiKey: config.apiKey, baseUrl: config.baseUrl }
}
