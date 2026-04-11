import { create } from 'zustand'
import type { SupportedLanguage } from '../i18n'

export type AIProvider = 'openai' | 'anthropic' | 'google'

export interface AIProviderConfig {
  apiKey: string
  model: string
  enabled: boolean
}

export const DEFAULT_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
}

interface SettingsStore {
  // Language
  language: SupportedLanguage

  // Theme
  themeId: string // 'light', 'dark', 'nord', 'solarized-light', 'solarized-dark', 'dracula'
  themeMode: 'manual' | 'system'
  vibrancy: boolean // frosted glass effect

  // AI providers
  providers: Record<AIProvider, AIProviderConfig>
  activeProvider: AIProvider | null

  // Actions
  setLanguage: (lang: SupportedLanguage) => void
  setThemeId: (id: string) => void
  setThemeMode: (mode: 'manual' | 'system') => void
  setVibrancy: (enabled: boolean) => void
  setProviderConfig: (provider: AIProvider, config: Partial<AIProviderConfig>) => void
  setActiveProvider: (provider: AIProvider | null) => void

  // Persistence
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
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
    set({ activeProvider })
    get().saveSettings()
  },

  loadSettings: async () => {
    try {
      const raw = await window.electronAPI.loadSettings()
      if (raw) {
        const s = raw as Record<string, unknown>
        set({
          language: (s.language as SupportedLanguage) ?? 'en',
          themeId: (s.themeId as string) ?? 'light',
          themeMode: (s.themeMode as 'manual' | 'system') ?? 'system',
          vibrancy: (s.vibrancy as boolean) ?? false,
          providers: (s.providers as Record<AIProvider, AIProviderConfig>) ?? get().providers,
          activeProvider: (s.activeProvider as AIProvider | null) ?? null,
        })
      }
    } catch {
      // Use defaults on error
    }
  },

  saveSettings: async () => {
    const { language, themeId, themeMode, vibrancy, providers, activeProvider } = get()
    try {
      await window.electronAPI.saveSettings({
        language,
        themeId,
        themeMode,
        vibrancy,
        providers,
        activeProvider,
      })
    } catch {
      // Silently fail
    }
  },
}))
