import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAgentStore } from '../../store/agentStore'
import { Bot, Globe, Shield, Database } from 'lucide-react'

export function StatusBar() {
  const { t } = useTranslation()
  const currentContent = useFileStore((s) => s.currentContent)
  const language = useSettingsStore((s) => s.language)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const providers = useSettingsStore((s) => s.providers)
  const privacyMode = useSettingsStore((s) => s.privacyMode)
  const ragIndexed = useAgentStore((s) => s.ragIndexed)
  const ragDocCount = useAgentStore((s) => s.ragDocCount)

  const stats = useMemo(() => {
    if (!currentContent) return null
    const chars = currentContent.length
    const words = currentContent
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, (m) => ` ${m} `)
      .split(/\s+/)
      .filter(Boolean).length
    const readingTime = Math.max(1, Math.round(words / 250))
    return { words, chars, readingTime }
  }, [currentContent])

  const activeModel = activeProvider ? providers[activeProvider]?.model : null

  return (
    <div
      className="flex items-center justify-between px-3 h-6 text-[11px] select-none flex-shrink-0 border-t"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Globe size={11} />
          <span>{language.toUpperCase()}</span>
        </div>

        <div className="flex items-center gap-1">
          <Bot size={11} />
          <span>{activeModel ?? t('statusBar.noModel')}</span>
          {activeProvider === 'ollama' && <span className="text-green-600">LOCAL</span>}
        </div>

        {privacyMode && (
          <div className="flex items-center gap-1 text-red-400">
            <Shield size={11} />
            <span>{t('statusBar.privacyOn')}</span>
          </div>
        )}

        {ragIndexed && (
          <div className="flex items-center gap-1">
            <Database size={11} />
            <span>{t('statusBar.ragDocs', { count: ragDocCount })}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {stats ? (
          <>
            <span>{t('statusBar.words', { count: stats.words })}</span>
            <span>{t('statusBar.chars', { count: stats.chars })}</span>
            <span>{t('statusBar.readingTime', { count: stats.readingTime })}</span>
          </>
        ) : (
          <span>{t('statusBar.ready')}</span>
        )}
      </div>
    </div>
  )
}
