import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useBatchIngestStore } from '../../store/batchIngestStore'
import { useUpdaterStore } from '../../store/updaterStore'
import { Bot, Globe, Shield, Network, Loader2, AlertCircle, CheckCircle2, X, Download } from 'lucide-react'

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

  // Batch-ingest progress (right-click → "Ingest whole folder" or the
  // Build-Graph button). When a batch is running, its progress is the
  // headline status — the per-file ingest stage lives *inside* the
  // batch so we don't need to show both.
  const batchStatus = useBatchIngestStore((s) => s.status)
  const batchDone = useBatchIngestStore((s) => s.done.length)
  const batchFailed = useBatchIngestStore((s) => s.failed.length)
  const batchTotal = useBatchIngestStore((s) => s.total)
  const cancelBatch = useBatchIngestStore((s) => s.cancel)
  const resetBatch = useBatchIngestStore((s) => s.reset)
  const batchProgress = batchTotal > 0
    ? Math.min(100, Math.round(((batchDone + batchFailed) / batchTotal) * 100))
    : 0

  // Auto-update: only surface a chip when an update is actually ready
  // to install. "Checking" / "not-available" are uninteresting and would
  // just add noise to an already-busy status bar.
  const updaterKind = useUpdaterStore((s) => s.kind)
  const updaterVersion = useUpdaterStore((s) => s.version)
  const quitAndInstall = useUpdaterStore((s) => s.quitAndInstall)

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
          {activeProvider === 'ollama' && <span className="text-success">LOCAL</span>}
        </div>

        {privacyMode && (
          <div className="flex items-center gap-1 text-red-400">
            <Shield size={11} />
            <span>{t('statusBar.privacyOn')}</span>
          </div>
        )}

        {/* Batch ingest takes precedence — when a queue is running we
            hide the single-file stage so the user sees one coherent
            progress indicator. */}
        {batchStatus === 'running' ? (
          <div className="flex items-center gap-2" style={{ color: 'var(--accent-color)' }}>
            <Loader2 size={11} className="animate-spin" />
            <Network size={11} />
            <span>
              {t('batchIngest.running', {
                done: batchDone + batchFailed,
                total: batchTotal,
              })}
            </span>
            <div
              className="h-1 w-24 rounded overflow-hidden"
              style={{ backgroundColor: 'var(--border-color)' }}
            >
              <div
                className="h-full transition-[width] duration-150"
                style={{ width: `${batchProgress}%`, backgroundColor: 'var(--accent-color)' }}
              />
            </div>
            <button
              onClick={cancelBatch}
              className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
              title={t('batchIngest.cancel')}
            >
              <X size={10} />
            </button>
          </div>
        ) : batchStatus === 'done' && batchTotal > 0 ? (
          <div
            className={`flex items-center gap-1 ${batchFailed > 0 ? 'text-warning' : 'text-success'}`}
          >
            <CheckCircle2 size={11} />
            <span>
              {t('batchIngest.completed', { ok: batchDone, failed: batchFailed })}
            </span>
            <button
              onClick={resetBatch}
              className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
              title={t('batchIngest.dismiss')}
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <>
            {ingestActive && (
              <div className="flex items-center gap-1" style={{ color: 'var(--accent-color)' }} title={ingestFilename ?? ''}>
                <Loader2 size={11} className="animate-spin" />
                <Network size={11} />
                <span>{t(`statusBar.ingest.${ingest.stage}`)}</span>
              </div>
            )}
            {ingest.stage === 'completed' && (
              <div className="flex items-center gap-1 text-success" title={ingestFilename ?? ''}>
                <CheckCircle2 size={11} />
                <span>{t('statusBar.ingest.completed')}</span>
              </div>
            )}
            {ingest.stage === 'failed' && (
              <div className="flex items-center gap-1 text-error" title={ingest.error ?? ''}>
                <AlertCircle size={11} />
                <span>{t('statusBar.ingest.failed')}</span>
              </div>
            )}
          </>
        )}

      </div>

      <div className="flex items-center gap-3">
        {updaterKind === 'downloaded' && (
          <button
            onClick={quitAndInstall}
            className="flex items-center gap-1 px-2 h-5 rounded text-[11px] font-medium"
            style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
            title={
              updaterVersion
                ? t('statusBar.updater.readyWithVersion', { version: updaterVersion })
                : t('statusBar.updater.readyTitle')
            }
          >
            <Download size={11} />
            <span>{t('statusBar.updater.ready')}</span>
          </button>
        )}

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
