import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { Bot, Globe, Shield, Network, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

export function StatusBar() {
  const { t } = useTranslation()
  const currentContent = useFileStore((s) => s.currentContent)
  const language = useSettingsStore((s) => s.language)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const providers = useSettingsStore((s) => s.providers)
  const privacyMode = useSettingsStore((s) => s.privacyMode)
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
  const ingest = useInsightGraphStore((s) => s.ingest)
  const ingestActive =
    ingest.stage !== 'idle' && ingest.stage !== 'completed' && ingest.stage !== 'failed'
  const ingestFilename = ingest.filePath ? ingest.filePath.split(/[/\\]/).pop() : null

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

        {ingestActive && (
          <div className="flex items-center gap-1" style={{ color: 'var(--accent-color)' }} title={ingestFilename ?? ''}>
            <Loader2 size={11} className="animate-spin" />
            <Network size={11} />
            <span>{t(`statusBar.ingest.${ingest.stage}`)}</span>
          </div>
        )}
        {ingest.stage === 'completed' && (
          <div className="flex items-center gap-1 text-green-500" title={ingestFilename ?? ''}>
            <CheckCircle2 size={11} />
            <span>{t('statusBar.ingest.completed')}</span>
          </div>
        )}
        {ingest.stage === 'failed' && (
          <div className="flex items-center gap-1 text-red-500" title={ingest.error ?? ''}>
            <AlertCircle size={11} />
            <span>{t('statusBar.ingest.failed')}</span>
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
