import { useState } from 'react'
import { X, Check, Loader2, Globe, Palette, Bot, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore, DEFAULT_MODELS, type AIProvider } from '../../store/settingsStore'
import { themes } from '../../lib/theme/themes'
import { LANGUAGES, changeLanguage, type SupportedLanguage } from '../../i18n'
import { clsx } from 'clsx'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

type Tab = 'language' | 'theme' | 'ai'

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('language')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[80vh] rounded-xl overflow-hidden shadow-2xl border flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('settings.title')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10">
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Tab sidebar */}
          <div className="w-48 border-r py-2 flex-shrink-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            {([
              { id: 'language' as Tab, icon: Globe, label: t('settings.language.title') },
              { id: 'theme' as Tab, icon: Palette, label: t('settings.theme.title') },
              { id: 'ai' as Tab, icon: Bot, label: t('settings.ai.title') },
            ]).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={clsx(
                  'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors',
                  activeTab === id ? 'font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5'
                )}
                style={{
                  color: activeTab === id ? 'var(--accent-color)' : 'var(--text-secondary)',
                  backgroundColor: activeTab === id ? 'var(--bg-primary)' : undefined,
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'language' && <LanguageSettings />}
            {activeTab === 'theme' && <ThemeSettings />}
            {activeTab === 'ai' && <AISettings />}
          </div>
        </div>
      </div>
    </div>
  )
}

function LanguageSettings() {
  const { t } = useTranslation()
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)

  const handleChange = (lang: SupportedLanguage) => {
    setLanguage(lang)
    changeLanguage(lang)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {t('settings.language.title')}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.language.description')}
      </p>
      <div className="space-y-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={clsx(
              'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors',
              language === lang.code
                ? 'border-[var(--accent-color)]'
                : 'border-[var(--border-color)] hover:bg-black/5 dark:hover:bg-white/5'
            )}
            style={{ color: 'var(--text-primary)' }}
          >
            <div>
              <span className="font-medium">{lang.nativeName}</span>
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>{lang.name}</span>
            </div>
            {language === lang.code && <Check size={16} style={{ color: 'var(--accent-color)' }} />}
          </button>
        ))}
      </div>
    </div>
  )
}

function ThemeSettings() {
  const { t } = useTranslation()
  const themeId = useSettingsStore((s) => s.themeId)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {t('settings.theme.title')}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.theme.description')}
      </p>

      {/* System follow toggle */}
      <label className="flex items-center gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={themeMode === 'system'}
          onChange={(e) => setThemeMode(e.target.checked ? 'system' : 'manual')}
          className="accent-[var(--accent-color)]"
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.theme.followSystem')}
        </span>
      </label>

      {/* Theme grid */}
      <div className="grid grid-cols-3 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => {
              setThemeId(theme.id)
              if (themeMode === 'system') setThemeMode('manual')
            }}
            className={clsx(
              'rounded-lg border p-3 text-left transition-all',
              themeId === theme.id
                ? 'border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]'
                : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
            )}
          >
            {/* Theme preview */}
            <div
              className="rounded-md h-16 mb-2 flex items-end p-1.5 gap-1"
              style={{ backgroundColor: theme.colors['--bg-primary'] }}
            >
              <div className="h-3 w-8 rounded-sm" style={{ backgroundColor: theme.colors['--bg-sidebar'] }} />
              <div className="flex-1 h-3 rounded-sm" style={{ backgroundColor: theme.colors['--bg-secondary'] }} />
              <div className="h-3 w-2 rounded-sm" style={{ backgroundColor: theme.colors['--accent-color'] }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {theme.name}
              </span>
              {themeId === theme.id && <Check size={12} style={{ color: 'var(--accent-color)' }} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function AISettings() {
  const { t } = useTranslation()
  const providers = useSettingsStore((s) => s.providers)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const setProviderConfig = useSettingsStore((s) => s.setProviderConfig)
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider)

  const providerList: { id: AIProvider; name: string; color: string }[] = [
    { id: 'openai', name: 'OpenAI', color: '#10a37f' },
    { id: 'anthropic', name: 'Anthropic', color: '#d4a574' },
    { id: 'google', name: 'Google AI', color: '#4285f4' },
  ]

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {t('settings.ai.title')}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.ai.description')}
      </p>

      <div className="space-y-4">
        {providerList.map(({ id, name, color }) => (
          <AIProviderCard
            key={id}
            id={id}
            name={name}
            color={color}
            config={providers[id]}
            isActive={activeProvider === id}
            onUpdate={(config) => setProviderConfig(id, config)}
            onActivate={() => setActiveProvider(activeProvider === id ? null : id)}
          />
        ))}
      </div>
    </div>
  )
}

function AIProviderCard({
  id,
  name,
  color,
  config,
  isActive,
  onUpdate,
  onActivate,
}: {
  id: AIProvider
  name: string
  color: string
  config: { apiKey: string; model: string; enabled: boolean }
  isActive: boolean
  onUpdate: (config: { apiKey?: string; model?: string; enabled?: boolean }) => void
  onActivate: () => void
}) {
  const { t } = useTranslation()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  const handleTest = async () => {
    if (!config.apiKey) return
    setTesting(true)
    setTestResult(null)
    try {
      const success = await window.electronAPI.testAgentConnection(id, config.apiKey)
      setTestResult(success)
    } catch {
      setTestResult(false)
    }
    setTesting(false)
  }

  return (
    <div
      className={clsx(
        'rounded-lg border p-4 transition-all',
        isActive ? 'ring-1' : ''
      )}
      style={{
        borderColor: isActive ? color : 'var(--border-color)',
        boxShadow: isActive ? `0 0 0 1px ${color}` : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</span>
        </div>
        <button
          onClick={onActivate}
          className={clsx(
            'text-xs px-2.5 py-1 rounded-full border transition-colors',
            isActive ? 'text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'
          )}
          style={{
            backgroundColor: isActive ? color : 'transparent',
            borderColor: isActive ? color : 'var(--border-color)',
            color: isActive ? '#fff' : 'var(--text-secondary)',
          }}
        >
          {isActive ? 'Active' : 'Activate'}
        </button>
      </div>

      {/* API Key */}
      <div className="mb-3">
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
          {t('settings.ai.apiKey')}
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              placeholder={t('settings.ai.apiKeyPlaceholder')}
              className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent-color)]"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
            >
              {showKey ? (
                <EyeOff size={14} style={{ color: 'var(--text-muted)' }} />
              ) : (
                <Eye size={14} style={{ color: 'var(--text-muted)' }} />
              )}
            </button>
          </div>
          <button
            onClick={handleTest}
            disabled={!config.apiKey || testing}
            className="text-xs px-3 py-2 rounded-md border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : t('settings.ai.testConnection')}
          </button>
        </div>
        {testResult !== null && (
          <p className={clsx('text-xs mt-1', testResult ? 'text-green-500' : 'text-red-500')}>
            {testResult ? t('settings.ai.connectionSuccess') : t('settings.ai.connectionFailed')}
          </p>
        )}
      </div>

      {/* Model selector */}
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
          {t('settings.ai.model')}
        </label>
        <select
          value={config.model}
          onChange={(e) => onUpdate({ model: e.target.value })}
          className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        >
          {DEFAULT_MODELS[id].map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
