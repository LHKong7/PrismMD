import { useEffect, useState } from 'react'
import { X, Check, Loader2, Globe, Palette, Bot, Eye, EyeOff, Shield, Trash2, Network, AlertTriangle, RefreshCw, Puzzle, FolderOpen, CircleAlert, Info, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore, DEFAULT_MODELS, type AIProvider, type InsightGraphDomain } from '../../store/settingsStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { usePluginManager } from '../../lib/plugins/host'
import { reloadExternalPlugins } from '../../lib/plugins/externalLoader'
import { useUpdaterStore } from '../../store/updaterStore'
import { themes } from '../../lib/theme/themes'
import { LANGUAGES, changeLanguage, type SupportedLanguage } from '../../i18n'
import { clsx } from 'clsx'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

type Tab = 'language' | 'theme' | 'ai' | 'privacy' | 'insightgraph' | 'plugins' | 'mcp' | 'about'

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
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10">
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 border-r py-2 flex-shrink-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            {([
              { id: 'language' as Tab, icon: Globe, label: t('settings.language.title') },
              { id: 'theme' as Tab, icon: Palette, label: t('settings.theme.title') },
              { id: 'ai' as Tab, icon: Bot, label: t('settings.ai.title') },
              { id: 'insightgraph' as Tab, icon: Network, label: t('settings.insightgraph.title') },
              { id: 'plugins' as Tab, icon: Puzzle, label: t('settings.plugins.title') },
              { id: 'mcp' as Tab, icon: Bot, label: t('settings.mcp.title') },
              { id: 'privacy' as Tab, icon: Shield, label: t('settings.privacy.title') },
              { id: 'about' as Tab, icon: Info, label: t('settings.about.title') },
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

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'language' && <LanguageSettings />}
            {activeTab === 'theme' && <ThemeSettings />}
            {activeTab === 'ai' && <AISettings />}
            {activeTab === 'insightgraph' && <InsightGraphSettings />}
            {activeTab === 'plugins' && <PluginsSettings />}
            {activeTab === 'mcp' && <McpSettingsSection />}
            {activeTab === 'privacy' && <PrivacySettings />}
            {activeTab === 'about' && <AboutSettings />}
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
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.language.title')}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.language.description')}</p>
      <div className="space-y-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={clsx(
              'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors',
              language === lang.code ? 'border-[var(--accent-color)]' : 'border-[var(--border-color)] hover:bg-black/5 dark:hover:bg-white/5'
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
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.theme.title')}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.theme.description')}</p>
      <label className="flex items-center gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={themeMode === 'system'}
          onChange={(e) => setThemeMode(e.target.checked ? 'system' : 'manual')}
          className="accent-[var(--accent-color)]"
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('settings.theme.followSystem')}</span>
      </label>
      <div className="grid grid-cols-3 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => { setThemeId(theme.id); if (themeMode === 'system') setThemeMode('manual') }}
            className={clsx(
              'rounded-lg border p-3 text-left transition-all',
              themeId === theme.id ? 'border-[var(--accent-color)] ring-1 ring-[var(--accent-color)]' : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
            )}
          >
            <div className="rounded-md h-16 mb-2 flex items-end p-1.5 gap-1" style={{ backgroundColor: theme.colors['--bg-primary'] }}>
              <div className="h-3 w-8 rounded-sm" style={{ backgroundColor: theme.colors['--bg-sidebar'] }} />
              <div className="flex-1 h-3 rounded-sm" style={{ backgroundColor: theme.colors['--bg-secondary'] }} />
              <div className="h-3 w-2 rounded-sm" style={{ backgroundColor: theme.colors['--accent-color'] }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{theme.name}</span>
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
  const privacyMode = useSettingsStore((s) => s.privacyMode)
  const setProviderConfig = useSettingsStore((s) => s.setProviderConfig)
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider)

  const providerList: { id: AIProvider; name: string; color: string; isLocal?: boolean; isCustom?: boolean }[] = [
    { id: 'ollama', name: t('settings.ai.ollama'), color: '#666666', isLocal: true },
    { id: 'openai', name: 'OpenAI', color: '#10a37f' },
    { id: 'anthropic', name: 'Anthropic', color: '#d4a574' },
    { id: 'google', name: 'Google AI', color: '#4285f4' },
    { id: 'custom', name: t('settings.ai.custom'), color: '#8b5cf6', isCustom: true },
  ]

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.ai.title')}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.ai.description')}</p>
      <div className="space-y-4">
        {providerList.map(({ id, name, color, isLocal, isCustom }) => (
          <AIProviderCard
            key={id}
            id={id}
            name={name}
            color={color}
            isLocal={isLocal}
            isCustom={isCustom}
            config={providers[id] ?? { apiKey: '', model: '', enabled: false, baseUrl: '' }}
            isActive={activeProvider === id}
            isDisabled={privacyMode && !isLocal}
            onUpdate={(config) => setProviderConfig(id, config)}
            onActivate={() => setActiveProvider(activeProvider === id ? null : id)}
          />
        ))}
      </div>
    </div>
  )
}

function PrivacySettings() {
  const { t } = useTranslation()
  const privacyMode = useSettingsStore((s) => s.privacyMode)
  const focusMode = useSettingsStore((s) => s.focusMode)
  const setPrivacyMode = useSettingsStore((s) => s.setPrivacyMode)
  const setFocusMode = useSettingsStore((s) => s.setFocusMode)
  const [memoryCleared, setMemoryCleared] = useState(false)

  const handleClearMemory = async () => {
    await window.electronAPI.memoryClear()
    setMemoryCleared(true)
    setTimeout(() => setMemoryCleared(false), 2000)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.privacy.title')}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.privacy.description')}</p>

      <div className="space-y-4">
        {/* Privacy Mode */}
        <div className="flex items-start gap-3 p-4 rounded-lg border" style={{ borderColor: privacyMode ? '#ef4444' : 'var(--border-color)' }}>
          <input
            type="checkbox"
            checked={privacyMode}
            onChange={(e) => setPrivacyMode(e.target.checked)}
            className="mt-0.5 accent-red-500"
          />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              <Shield size={14} className="inline mr-1" />
              {t('settings.privacy.privacyMode')}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('settings.privacy.privacyModeDesc')}
            </p>
          </div>
        </div>

        {/* Focus Mode */}
        <div className="flex items-start gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
          <input
            type="checkbox"
            checked={focusMode}
            onChange={(e) => setFocusMode(e.target.checked)}
            className="mt-0.5 accent-[var(--accent-color)]"
          />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.privacy.focusMode')}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.privacy.focusModeDesc')}</p>
          </div>
        </div>

        {/* Clear Memory */}
        <div className="flex items-center justify-between p-4 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.privacy.clearMemory')}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.privacy.clearMemoryDesc')}</p>
          </div>
          <button
            onClick={handleClearMemory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors hover:bg-red-500/10"
            style={{ borderColor: 'var(--border-color)', color: memoryCleared ? '#22c55e' : '#ef4444' }}
          >
            {memoryCleared ? <Check size={12} /> : <Trash2 size={12} />}
            {memoryCleared ? t('settings.privacy.cleared') : t('settings.privacy.clearMemory')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AIProviderCard({
  id, name, color, isLocal, isCustom, config, isActive, isDisabled, onUpdate, onActivate,
}: {
  id: AIProvider; name: string; color: string; isLocal?: boolean; isCustom?: boolean
  config: { apiKey: string; model: string; enabled: boolean; baseUrl?: string }
  isActive: boolean; isDisabled?: boolean
  onUpdate: (config: { apiKey?: string; model?: string; enabled?: boolean; baseUrl?: string }) => void
  onActivate: () => void
}) {
  const { t } = useTranslation()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const success = await window.electronAPI.testAgentConnection(id, config.apiKey, config.baseUrl)
      setTestResult(success)
    } catch { setTestResult(false) }
    setTesting(false)
  }

  return (
    <div
      className={clsx('rounded-lg border p-4 transition-all', isDisabled && 'opacity-50')}
      style={{ borderColor: isActive ? color : 'var(--border-color)', boxShadow: isActive ? `0 0 0 1px ${color}` : undefined }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</span>
          {isLocal && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">LOCAL</span>
          )}
        </div>
        <button
          onClick={onActivate}
          disabled={isDisabled}
          className={clsx('text-xs px-2.5 py-1 rounded-full border transition-colors', isActive ? 'text-white' : 'hover:bg-black/5 dark:hover:bg-white/5')}
          style={{
            backgroundColor: isActive ? color : 'transparent',
            borderColor: isActive ? color : 'var(--border-color)',
            color: isActive ? '#fff' : 'var(--text-secondary)',
          }}
        >
          {isActive ? 'Active' : 'Activate'}
        </button>
      </div>

      {/* Base URL (Ollama + Custom) */}
      {(isLocal || isCustom) && (
        <div className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('settings.ai.baseUrl')}</label>
          <input
            type="text"
            value={config.baseUrl ?? ''}
            onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            placeholder={isCustom ? t('settings.ai.customBaseUrlPlaceholder') : t('settings.ai.baseUrlPlaceholder')}
            className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent-color)]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
          {isLocal && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('settings.ai.localNote')}</p>}
          {isCustom && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{t('settings.ai.customNote')}</p>}
        </div>
      )}

      {/* API Key (not for local-only providers) */}
      {!isLocal && (
        <div className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('settings.ai.apiKey')}</label>
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
              <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                {showKey ? <EyeOff size={14} style={{ color: 'var(--text-muted)' }} /> : <Eye size={14} style={{ color: 'var(--text-muted)' }} />}
              </button>
            </div>
            <button
              onClick={handleTest}
              disabled={(!config.apiKey && !isLocal) || testing}
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
      )}

      {/* Test button for local */}
      {isLocal && (
        <div className="mb-3 flex gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-xs px-3 py-2 rounded-md border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : t('settings.ai.testConnection')}
          </button>
          {testResult !== null && (
            <span className={clsx('text-xs flex items-center', testResult ? 'text-green-500' : 'text-red-500')}>
              {testResult ? t('settings.ai.connectionSuccess') : t('settings.ai.connectionFailed')}
            </span>
          )}
        </div>
      )}

      {/* Model */}
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('settings.ai.model')}</label>
        {isCustom ? (
          <input
            type="text"
            value={config.model}
            onChange={(e) => onUpdate({ model: e.target.value })}
            placeholder={t('settings.ai.customModelPlaceholder')}
            className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent-color)]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        ) : (
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
        )}
      </div>
    </div>
  )
}

function InsightGraphSettings() {
  const { t } = useTranslation()
  const insightGraph = useSettingsStore((s) => s.insightGraph)
  const setConfig = useSettingsStore((s) => s.setInsightGraphConfig)
  const activeProvider = useSettingsStore((s) => s.activeProvider)

  const reports = useInsightGraphStore((s) => s.reports)
  const refreshReports = useInsightGraphStore((s) => s.refreshReports)

  const [showPassword, setShowPassword] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    if (insightGraph.enabled) {
      refreshReports()
    }
  }, [insightGraph.enabled, refreshReports])

  const providerIncompatible = activeProvider === 'anthropic' || activeProvider === 'google'

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.electronAPI.insightGraphTestNeo4j(
        insightGraph.neo4j.uri,
        insightGraph.neo4j.user,
        insightGraph.neo4j.password,
      )
      setTestResult(res)
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    setTesting(false)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {t('settings.insightgraph.title')}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.insightgraph.description')}
      </p>

      {/* Enable toggle */}
      <div
        className="flex items-start gap-3 p-4 rounded-lg border mb-4"
        style={{ borderColor: insightGraph.enabled ? 'var(--accent-color)' : 'var(--border-color)' }}
      >
        <input
          type="checkbox"
          checked={insightGraph.enabled}
          onChange={(e) => setConfig({ enabled: e.target.checked })}
          className="mt-0.5 accent-[var(--accent-color)]"
        />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            <Network size={14} className="inline mr-1" />
            {t('settings.insightgraph.enable')}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t('settings.insightgraph.enableDesc')}
          </p>
        </div>
      </div>

      {providerIncompatible && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg border mb-4 text-xs"
          style={{ borderColor: '#f59e0b', backgroundColor: '#f59e0b14', color: 'var(--text-primary)' }}
        >
          <AlertTriangle size={14} style={{ color: '#f59e0b' }} className="mt-0.5 flex-shrink-0" />
          <span>{t('settings.insightgraph.providerWarning')}</span>
        </div>
      )}

      {/* Neo4j */}
      <div className="rounded-lg border p-4 mb-4" style={{ borderColor: 'var(--border-color)' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('settings.insightgraph.neo4j')}
        </p>

        <div className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            {t('settings.insightgraph.uri')}
          </label>
          <input
            type="text"
            value={insightGraph.neo4j.uri}
            onChange={(e) => setConfig({ neo4j: { uri: e.target.value } })}
            placeholder={t('settings.insightgraph.uriPlaceholder')}
            className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent-color)]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            {t('settings.insightgraph.user')}
          </label>
          <input
            type="text"
            value={insightGraph.neo4j.user}
            onChange={(e) => setConfig({ neo4j: { user: e.target.value } })}
            placeholder={t('settings.insightgraph.userPlaceholder')}
            className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent-color)]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            {t('settings.insightgraph.password')}
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={insightGraph.neo4j.password}
                onChange={(e) => setConfig({ neo4j: { password: e.target.value } })}
                placeholder={t('settings.insightgraph.passwordPlaceholder')}
                className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent-color)]"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                type="button"
              >
                {showPassword
                  ? <EyeOff size={14} style={{ color: 'var(--text-muted)' }} />
                  : <Eye size={14} style={{ color: 'var(--text-muted)' }} />}
              </button>
            </div>
            <button
              onClick={handleTest}
              disabled={testing || !insightGraph.neo4j.uri}
              className="text-xs px-3 py-2 rounded-md border transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              type="button"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : t('settings.insightgraph.testConnection')}
            </button>
          </div>
          {testResult && (
            <p className={`text-xs mt-1 ${testResult.ok ? 'text-green-500' : 'text-red-500'}`}>
              {testResult.ok
                ? t('settings.insightgraph.connectionSuccess')
                : `${t('settings.insightgraph.connectionFailed')}${testResult.error ? ': ' + testResult.error : ''}`}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            {t('settings.insightgraph.domain')}
          </label>
          <select
            value={insightGraph.domain}
            onChange={(e) => setConfig({ domain: e.target.value as InsightGraphDomain })}
            className="w-full text-sm px-3 py-2 rounded-md border bg-transparent outline-none"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="default">{t('settings.insightgraph.domainDefault')}</option>
            <option value="stock_analysis">{t('settings.insightgraph.domainStock')}</option>
            <option value="restaurant_analysis">{t('settings.insightgraph.domainRestaurant')}</option>
          </select>
        </div>

        {/* Entity linking toggle — opt-in per user choice during planning. */}
        <label className="mt-3 flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={insightGraph.entityLinking}
            onChange={(e) => setConfig({ entityLinking: e.target.checked })}
            className="mt-0.5 accent-[var(--accent-color)]"
          />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.insightgraph.entityLinking')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('settings.insightgraph.entityLinkingDesc')}
            </p>
          </div>
        </label>
      </div>

      {/* Reports */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('settings.insightgraph.reports')}
          </p>
          <button
            onClick={() => refreshReports()}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            type="button"
          >
            <RefreshCw size={12} />
            {t('settings.insightgraph.refreshReports')}
          </button>
        </div>
        {reports.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('settings.insightgraph.noReports')}
          </p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {reports.map((r) => (
              <li
                key={r.reportId}
                className="text-xs flex items-center justify-between gap-2 p-2 rounded border"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              >
                <span className="truncate flex-1" title={r.filePath ?? r.filename}>
                  {r.filename ?? r.reportId}
                </span>
                <span className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {(r.entities ?? 0)} {t('settings.insightgraph.entities')} ·{' '}
                  {(r.claims ?? 0)} {t('settings.insightgraph.claims')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Plugin management pane. Lists every loaded plugin (built-in + external),
 * surfaces load errors, and exposes a "Open plugin folder" shortcut so
 * users know where to drop new plugins.
 */
function PluginsSettings() {
  const { t } = useTranslation()
  const loaded = usePluginManager((s) => s.loaded)
  const [pluginDir, setPluginDir] = useState('')
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    void window.electronAPI.pluginsGetDir().then(setPluginDir)
  }, [])

  const entries = Object.values(loaded)
  const builtIn = entries.filter((e) => e.plugin.id.startsWith('prismmd.'))
  const external = entries.filter((e) => !e.plugin.id.startsWith('prismmd.'))

  const handleReload = async () => {
    setReloading(true)
    try {
      await reloadExternalPlugins()
    } finally {
      setReloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('settings.plugins.title')}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('settings.plugins.subtitle')}
        </p>
      </div>

      {/* Trust warning for external plugins. */}
      <div
        className="flex items-start gap-2 p-3 rounded border text-xs"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <CircleAlert size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <span style={{ color: 'var(--text-secondary)' }}>
          {t('settings.plugins.trustWarning')}
        </span>
      </div>

      {/* Plugin folder shortcut. */}
      <div
        className="flex items-center justify-between p-3 rounded border"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.plugins.folderLabel')}
          </div>
          <div
            className="text-[11px] font-mono truncate mt-0.5"
            style={{ color: 'var(--text-muted)' }}
            title={pluginDir}
          >
            {pluginDir || '…'}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => window.electronAPI.pluginsOpenDir()}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-black/5 dark:hover:bg-white/5"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            <FolderOpen size={12} />
            {t('settings.plugins.openFolder')}
          </button>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            {reloading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t('settings.plugins.reload')}
          </button>
        </div>
      </div>

      <PluginList title={t('settings.plugins.builtin')} entries={builtIn} />
      <PluginList
        title={t('settings.plugins.external')}
        entries={external}
        emptyMessage={t('settings.plugins.externalEmpty')}
      />
    </div>
  )
}

function PluginList({
  title,
  entries,
  emptyMessage,
}: {
  title: string
  entries: ReturnType<typeof usePluginManager>['loaded'][string][]
  emptyMessage?: string
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h4>
      {entries.length === 0 ? (
        emptyMessage && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {emptyMessage}
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {entries.map(({ plugin, error }) => (
            <li
              key={plugin.id}
              className="p-3 rounded border"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {plugin.name}
                    <span
                      className="ml-2 text-[10px] font-mono"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      v{plugin.version}
                    </span>
                  </div>
                  {plugin.description && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {plugin.description}
                    </div>
                  )}
                  <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                    {plugin.id}
                  </div>
                </div>
              </div>
              {error && (
                <div
                  className="mt-2 flex items-start gap-2 text-xs p-2 rounded"
                  style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                >
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                  <span className="font-mono break-all">{error}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * MCP (Model Context Protocol) settings. Exposes the raw Claude-Desktop-style
 * JSON config so power users can paste existing `mcpServers` directly, plus
 * a read-only status row showing which servers are currently running and how
 * many tools each exposes. A future commit will add a friendlier per-server
 * form; JSON works today.
 */
function McpSettingsSection() {
  const { t } = useTranslation()
  const mcp = useSettingsStore((s) => s.mcp)
  const setMcpConfig = useSettingsStore((s) => s.setMcpConfig)

  // Local draft buffer so the JSON field can be edited freely without
  // clobbering settings on every keystroke. We only commit on "Save".
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<
    Array<{ id: string; running: boolean; toolCount: number }>
  >([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setDraft(JSON.stringify(mcp.servers, null, 2))
  }, [mcp.servers])

  const loadStatuses = async () => {
    const res = await window.electronAPI.mcpStatusAll()
    if (res.ok) setStatuses(res.servers)
  }

  useEffect(() => {
    void loadStatuses()
  }, [mcp.enabled, mcp.servers])

  const handleSave = () => {
    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>
      // Shallow-validate the shape. Each entry must have a `command` string
      // and an `args` array — this matches Claude Desktop's format.
      for (const [id, entry] of Object.entries(parsed)) {
        const e = entry as Record<string, unknown>
        if (typeof e.command !== 'string') throw new Error(`${id}: missing "command"`)
        if (!Array.isArray(e.args)) throw new Error(`${id}: "args" must be an array`)
      }
      setMcpConfig({ servers: parsed as typeof mcp.servers })
      setDraftError(null)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRestart = async () => {
    setRefreshing(true)
    try {
      await window.electronAPI.mcpRestart()
      await loadStatuses()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('settings.mcp.title')}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('settings.mcp.subtitle')}
        </p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={mcp.enabled}
          onChange={(e) => setMcpConfig({ enabled: e.target.checked })}
        />
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
          {t('settings.mcp.enable')}
        </span>
      </label>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.mcp.serversLabel')}
          </label>
          <a
            href="https://modelcontextprotocol.io/docs/quickstart/user"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] hover:underline"
            style={{ color: 'var(--accent-color)' }}
          >
            {t('settings.mcp.docs')}
          </a>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'{\n  "fetch": {\n    "command": "npx",\n    "args": ["-y", "@modelcontextprotocol/server-fetch"]\n  }\n}'}
          spellCheck={false}
          className="w-full min-h-[180px] text-xs font-mono p-3 rounded border outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: draftError ? '#ef4444' : 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
        {draftError && (
          <p className="mt-1 text-xs text-red-500">{draftError}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleSave}
            className="text-xs px-3 py-1 rounded font-medium"
            style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
          >
            {t('settings.mcp.save')}
          </button>
          <button
            onClick={handleRestart}
            disabled={refreshing}
            className="flex items-center gap-1 text-xs px-3 py-1 rounded border hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            {refreshing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {t('settings.mcp.restart')}
          </button>
        </div>
      </div>

      {statuses.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('settings.mcp.status')}
          </h4>
          <ul className="space-y-1">
            {statuses.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between p-2 rounded border text-xs"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${s.running ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                    {s.id}
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>
                  {s.running
                    ? t('settings.mcp.toolCount', { count: s.toolCount })
                    : t('settings.mcp.stopped')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * About & Updates. Shows the running version and the current auto-update
 * state, with manual check + restart-to-install actions. Auto-update
 * only runs in packaged mac/win builds — dev runs and linux packages
 * show the "dev / unsupported" banner instead of a non-functional button.
 */
function AboutSettings() {
  const { t } = useTranslation()
  const currentVersion = useUpdaterStore((s) => s.currentVersion)
  const kind = useUpdaterStore((s) => s.kind)
  const nextVersion = useUpdaterStore((s) => s.version)
  const error = useUpdaterStore((s) => s.error)
  const lastEventAt = useUpdaterStore((s) => s.lastEventAt)
  const checkNow = useUpdaterStore((s) => s.checkNow)
  const quitAndInstall = useUpdaterStore((s) => s.quitAndInstall)

  // "x seconds / minutes / hours ago" for the last-checked timestamp.
  // Kept as a cheap polling clock instead of a tick loop because this
  // surface is read-rarely and the precision doesn't matter.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!lastEventAt) return
    const id = window.setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [lastEventAt])

  const relativeTime = lastEventAt
    ? formatRelativeTime(Date.now() - lastEventAt, t)
    : null

  const statusLine = (() => {
    switch (kind) {
      case 'checking': return t('settings.about.statusChecking')
      case 'available': return t('settings.about.statusAvailable', { version: nextVersion ?? '' })
      case 'downloading': return t('settings.about.statusDownloading')
      case 'downloaded': return t('settings.about.statusDownloaded', { version: nextVersion ?? '' })
      case 'not-available': return t('settings.about.statusLatest')
      case 'error': return t('settings.about.statusError', { error: error ?? '' })
      default: return t('settings.about.statusIdle')
    }
  })()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('settings.about.title')}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('settings.about.subtitle')}
        </p>
      </div>

      {/* Version + current state */}
      <div
        className="flex items-start justify-between gap-3 p-4 rounded border"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            PrismMD
            {currentVersion && (
              <span
                className="ml-2 text-[11px] font-mono"
                style={{ color: 'var(--text-muted)' }}
              >
                v{currentVersion}
              </span>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {statusLine}
          </div>
          {relativeTime && (
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('settings.about.lastChecked', { time: relativeTime })}
            </div>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-1 flex-shrink-0">
          {kind === 'downloaded' ? (
            <button
              onClick={quitAndInstall}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded font-medium"
              style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
            >
              <Download size={12} />
              {t('settings.about.restartNow')}
            </button>
          ) : (
            <button
              onClick={() => void checkNow()}
              disabled={kind === 'checking' || kind === 'downloading'}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded border hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              {kind === 'checking' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {t('settings.about.checkNow')}
            </button>
          )}
        </div>
      </div>

      {/* Dev / linux hint — auto-updater skips these silently in the
          main process; explaining *why* beats an invisible no-op. */}
      {kind === 'idle' && !lastEventAt && (
        <div
          className="flex items-start gap-2 p-3 rounded border text-xs"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
        >
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>{t('settings.about.devNote')}</span>
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(ms: number, t: (key: string, vars?: Record<string, unknown>) => string): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return t('settings.about.relative.secondsAgo', { count: s })
  const m = Math.floor(s / 60)
  if (m < 60) return t('settings.about.relative.minutesAgo', { count: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('settings.about.relative.hoursAgo', { count: h })
  const d = Math.floor(h / 24)
  return t('settings.about.relative.daysAgo', { count: d })
}
