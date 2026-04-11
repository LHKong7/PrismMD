import Store from 'electron-store'

interface AppSettings {
  language: string
  themeId: string
  themeMode: string
  vibrancy: boolean
  providers: Record<string, {
    apiKey: string
    model: string
    enabled: boolean
  }>
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
      providers: {
        openai: { apiKey: '', model: 'gpt-4o', enabled: false },
        anthropic: { apiKey: '', model: 'claude-sonnet-4-20250514', enabled: false },
        google: { apiKey: '', model: 'gemini-1.5-pro', enabled: false },
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

export function getActiveProvider(): { provider: string; model: string; apiKey: string } | null {
  const settings = loadSettings()
  const provider = settings.activeProvider
  if (!provider) return null

  const config = settings.providers?.[provider]
  if (!config?.apiKey) return null

  return { provider, model: config.model, apiKey: config.apiKey }
}
