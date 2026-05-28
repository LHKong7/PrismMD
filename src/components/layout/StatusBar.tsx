import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useEditorStore } from '../../store/editorStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useBatchIngestStore } from '../../store/batchIngestStore'
import { useUpdaterStore } from '../../store/updaterStore'
import { useUIStore } from '../../store/uiStore'
import { useHorseModeStore } from '../../store/horseModeStore'
import { useAgentLogStore, type LogSource } from '../../store/agentLogStore'
import {
  Bot, Globe, Shield, Network, Loader2, AlertCircle,
  CheckCircle2, X, Download, MoreHorizontal, Circle, Zap, ScrollText,
} from 'lucide-react'

export function StatusBar() {
  const { t } = useTranslation()
  const zenMode = useUIStore((s) => s.zenMode)
  const deepEditing = useUIStore((s) => s.deepEditing)
  const toggleDeepEditing = useUIStore((s) => s.toggleDeepEditing)
  const horseModeActive = useHorseModeStore((s) => s.active)
  const horseModeStage = useHorseModeStore((s) => s.stage)
  const agentLogEntries = useAgentLogStore((s) => s.entries)
  const agentLogOpen = useAgentLogStore((s) => s.panelOpen)
  const toggleAgentLog = useAgentLogStore((s) => s.togglePanel)
  const clearAgentLog = useAgentLogStore((s) => s.clear)
  const currentContent = useFileStore((s) => s.currentContent)
  const editing = useEditorStore((s) => s.editing)
  const isDirty = useEditorStore((s) => s.isDirty)
  const language = useSettingsStore((s) => s.language)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const providers = useSettingsStore((s) => s.providers)
  const privacyMode = useSettingsStore((s) => s.privacyMode)
  const [expanded, setExpanded] = useState(false)

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

  const batchStatus = useBatchIngestStore((s) => s.status)
  const batchDone = useBatchIngestStore((s) => s.done.length)
  const batchFailed = useBatchIngestStore((s) => s.failed.length)
  const batchTotal = useBatchIngestStore((s) => s.total)
  const cancelBatch = useBatchIngestStore((s) => s.cancel)
  const resetBatch = useBatchIngestStore((s) => s.reset)
  const batchProgress = batchTotal > 0
    ? Math.min(100, Math.round(((batchDone + batchFailed) / batchTotal) * 100))
    : 0

  const updaterKind = useUpdaterStore((s) => s.kind)
  const updaterVersion = useUpdaterStore((s) => s.version)
  const quitAndInstall = useUpdaterStore((s) => s.quitAndInstall)

  // Hide entirely in zen mode.
  if (zenMode) return null

  return (
    <div
      className="flex items-center justify-between px-3 h-6 text-[11px] select-none flex-shrink-0 border-t"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
    >
      <div className="flex items-center gap-3">
        {/* Deep editing indicator */}
        {deepEditing && (
          <button
            onClick={toggleDeepEditing}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
            title={t('statusBar.deepEditing', 'Deep Editing — click to exit')}
          >
            <span className="text-[10px] font-medium">{t('statusBar.deepEditingLabel', 'Deep Editing')}</span>
          </button>
        )}
        {/* Horse Mode indicator */}
        {horseModeActive && (
          <button
            onClick={toggleAgentLog}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
          >
            {horseModeStage === 'generating' ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Zap size={10} />
            )}
            <span className="text-[10px] font-medium">
              {t('horseMode.statusLabel', 'Horse Mode')}
            </span>
          </button>
        )}
        {/* Save state indicator — always visible when editing */}
        {editing && (
          <div className="flex items-center gap-1">
            <Circle
              size={7}
              fill={isDirty ? 'var(--color-warning)' : 'var(--color-success)'}
              stroke="none"
            />
            <span>{isDirty ? t('statusBar.unsaved') : t('statusBar.saved')}</span>
          </div>
        )}

        {/* Expandable secondary info — AI model, language, privacy, ingest */}
        {expanded ? (
          <>
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

            <button
              onClick={() => setExpanded(false)}
              className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
              aria-label="Collapse status details"
            >
              <X size={10} />
            </button>
          </>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Show status details"
          >
            <MoreHorizontal size={12} />
          </button>
        )}

        {/* Batch ingest takes precedence */}
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
        {/* Unified Agent Log */}
        {agentLogEntries.length > 0 && (
          <div className="relative">
            <button
              onClick={toggleAgentLog}
              className="flex items-center gap-1 px-1 py-0.5 rounded transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              title="Agent Activity Log"
            >
              <ScrollText size={11} />
              <span className="text-[10px]">{agentLogEntries.length}</span>
            </button>
            {agentLogOpen && (
              <AgentLogPanel entries={agentLogEntries} onClear={clearAgentLog} onClose={toggleAgentLog} />
            )}
          </div>
        )}

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
          <span>{t('statusBar.words', { count: stats.words })}</span>
        ) : (
          <span>{t('statusBar.ready')}</span>
        )}
      </div>
    </div>
  )
}

const SOURCE_LABELS: Record<LogSource, { label: string; color: string }> = {
  'horse-mode': { label: 'Horse', color: 'var(--color-warning)' },
  'agent-chat': { label: 'Chat', color: 'var(--accent-color)' },
  'graph-ingest': { label: 'Graph', color: 'var(--color-info)' },
  'editor-ai': { label: 'Edit', color: 'var(--color-success)' },
  'flashcard': { label: 'Flash', color: '#8b5cf6' },
  'knowledge-base': { label: 'KB', color: '#06b6d4' },
  'export': { label: 'Export', color: 'var(--text-muted)' },
  'system': { label: 'Sys', color: 'var(--text-muted)' },
}

function AgentLogPanel({ entries, onClear, onClose }: {
  entries: import('../../store/agentLogStore').AgentLogEntry[]
  onClear: () => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute bottom-full right-0 mb-1 z-50 w-96 max-h-64 flex flex-col rounded-lg shadow-2xl border"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-1.5">
          <ScrollText size={12} style={{ color: 'var(--text-secondary)' }} />
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Agent Activity
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
            {entries.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClear} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity" style={{ color: 'var(--text-muted)' }}>
            Clear
          </button>
          <button onClick={onClose} className="p-0.5 rounded hover:opacity-80 transition-opacity">
            <X size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {[...entries].reverse().map((entry) => {
          const src = SOURCE_LABELS[entry.source] ?? SOURCE_LABELS.system
          return (
            <div
              key={entry.id}
              className="flex items-start gap-2 px-3 py-1 border-b last:border-b-0 text-[11px]"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <span className="text-[9px] tabular-nums flex-shrink-0 mt-px" style={{ color: 'var(--text-muted)' }}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span
                className="text-[9px] font-semibold px-1 py-0 rounded flex-shrink-0 mt-px"
                style={{ color: src.color, backgroundColor: `color-mix(in srgb, ${src.color} 12%, transparent)` }}
              >
                {src.label}
              </span>
              <span
                className="flex-1 break-words"
                style={{
                  color: entry.level === 'error' ? 'var(--color-error)'
                    : entry.level === 'success' ? 'var(--color-success)'
                    : entry.level === 'warning' ? 'var(--color-warning)'
                    : 'var(--text-secondary)',
                }}
              >
                {entry.message}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
