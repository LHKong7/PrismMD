import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { Bot, Globe } from 'lucide-react'
import { useMemo } from 'react'

export function StatusBar() {
  const { t } = useTranslation()
  const currentContent = useFileStore((s) => s.currentContent)
  const language = useSettingsStore((s) => s.language)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const providers = useSettingsStore((s) => s.providers)

  const stats = useMemo(() => {
    if (!currentContent) return null
    const chars = currentContent.length
    // Word count: split on whitespace and CJK characters
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
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-muted)',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Language indicator */}
        <div className="flex items-center gap-1">
          <Globe size={11} />
          <span>{language.toUpperCase()}</span>
        </div>

        {/* AI model indicator */}
        <div className="flex items-center gap-1">
          <Bot size={11} />
          <span>{activeModel ?? t('statusBar.noModel')}</span>
        </div>
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
