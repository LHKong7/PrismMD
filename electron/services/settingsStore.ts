import Store from 'electron-store'

interface ProviderConfig {
  apiKey: string
  model: string
  enabled: boolean
  baseUrl?: string
}

interface AppSettings {
  language: string
  themeId: string
  themeMode: string
  vibrancy: boolean
  privacyMode: boolean
  providers: Record<string, ProviderConfig>
  activeProvider: string | null
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
      },
      activeProvider: null,
    },
  },
})

export function loadSettings(): AppSettings {
  return store.get('settings')
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
