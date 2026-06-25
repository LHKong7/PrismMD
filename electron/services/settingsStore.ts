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

/**
 * MCP *server* exposure — the inverse direction of `McpSettings`. When enabled,
 * PrismMD runs a localhost-only Streamable-HTTP MCP server so external agents
 * (Claude Code / Desktop) can read the user's notes as tools. Bound to
 * 127.0.0.1 and gated by a bearer `token`.
 */
export interface McpServerExposeSettings {
  enabled: boolean
  /** TCP port for the localhost server. */
  port: number
  /** Bearer token required on every request (generated on first enable). */
  token: string
}

/**
 * Semantic search (RAG) over the user's notes — chunk + embed document bodies
 * into a local vector index so `search_notes` (and future agent retrieval) can
 * rank by meaning rather than keyword. Embeddings come from an OpenAI-compatible
 * endpoint resolved from one of the configured providers.
 */
export interface RagSettings {
  enabled: boolean
  /** Which configured provider supplies the OpenAI-compatible embeddings API. */
  providerId: 'openai' | 'custom' | 'ollama'
  /** Embedding model id (e.g. text-embedding-3-small, nomic-embed-text). */
  model: string
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
  mcpServer: McpServerExposeSettings
  rag: RagSettings
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

const DEFAULT_MCP_SERVER: McpServerExposeSettings = {
  enabled: false,
  port: 3920,
  token: '',
}

const DEFAULT_RAG: RagSettings = {
  enabled: false,
  providerId: 'openai',
  model: 'text-embedding-3-small',
}

const store = new Store<{ settings: AppSettings }>({
  name: 'prismmd-settings',
  defaults: {
    settings: {
      language: 'en',
      themeId: 'parchment',
      themeMode: 'manual',
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
      mcpServer: DEFAULT_MCP_SERVER,
      rag: DEFAULT_RAG,
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
    mcpServer: {
      ...DEFAULT_MCP_SERVER,
      ...(s.mcpServer ?? {}),
    },
    rag: {
      ...DEFAULT_RAG,
      ...(s.rag ?? {}),
    },
  }
}

export function getInsightGraphSettings(): InsightGraphSettings {
  return loadSettings().insightGraph
}

export function getMcpSettings(): McpSettings {
  return loadSettings().mcp
}

export function getMcpServerSettings(): McpServerExposeSettings {
  return loadSettings().mcpServer
}

/** Merge a partial update into the MCP-server settings and persist it. */
export function saveMcpServerSettings(patch: Partial<McpServerExposeSettings>): McpServerExposeSettings {
  const settings = loadSettings()
  const next = { ...settings.mcpServer, ...patch }
  saveSettings({ ...settings, mcpServer: next })
  return next
}

export function getRagSettings(): RagSettings {
  return loadSettings().rag
}

/** Merge a partial update into the RAG settings and persist it. */
export function saveRagSettings(patch: Partial<RagSettings>): RagSettings {
  const settings = loadSettings()
  const next = { ...settings.rag, ...patch }
  saveSettings({ ...settings, rag: next })
  return next
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
