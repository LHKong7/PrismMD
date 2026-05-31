import { useState } from 'react'
import { ChevronRight, ChevronDown, Copy, Trash2, Clock, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgentTraceStore, type TraceEntry, type TraceType } from '../../store/agentTraceStore'

const TYPE_COLORS: Record<TraceType, string> = {
  'request': '#3b82f6',
  'system-prompt': '#8b5cf6',
  'messages': '#06b6d4',
  'tools': '#f59e0b',
  'response': '#22c55e',
  'tool-call': '#f97316',
  'error': '#ef4444',
}

const TYPE_LABELS: Record<TraceType, string> = {
  'request': 'REQ',
  'system-prompt': 'SYS',
  'messages': 'MSG',
  'tools': 'TOOL',
  'response': 'RES',
  'tool-call': 'CALL',
  'error': 'ERR',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function TraceEntryRow({ entry }: { entry: TraceEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = JSON.stringify(entry.data, null, 2)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const color = TYPE_COLORS[entry.type]

  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: 'var(--border-color)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {expanded
          ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}

        <span
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: color + '20', color }}
        >
          {TYPE_LABELS[entry.type]}
        </span>

        <span
          className="text-xs flex-1 truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {entry.label}
        </span>

        {entry.durationMs != null && (
          <span className="flex items-center gap-0.5 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            <Clock size={10} />
            {entry.durationMs}ms
          </span>
        )}

        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {formatTime(entry.timestamp)}
        </span>

        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
          title="Copy JSON"
        >
          {copied
            ? <Check size={11} style={{ color: 'var(--color-success)' }} />
            : <Copy size={11} style={{ color: 'var(--text-muted)' }} />}
        </button>
      </button>

      {expanded && (
        <div
          className="px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {JSON.stringify(entry.data, null, 2)}
        </div>
      )}
    </div>
  )
}

export function AgentTracePanel() {
  const { t } = useTranslation()
  const entries = useAgentTraceStore((s) => s.entries)
  const clear = useAgentTraceStore((s) => s.clear)
  const [filter, setFilter] = useState<TraceType | 'all'>('all')

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.type === filter)

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {t('settings.developer.title')}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('settings.developer.description')}
      </p>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as TraceType | 'all')}
          className="text-xs px-2 py-1 rounded border outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">{t('settings.developer.filterAll')}</option>
          <option value="request">{t('settings.developer.filterRequest')}</option>
          <option value="system-prompt">{t('settings.developer.filterSystemPrompt')}</option>
          <option value="messages">{t('settings.developer.filterMessages')}</option>
          <option value="tools">{t('settings.developer.filterTools')}</option>
          <option value="response">{t('settings.developer.filterResponse')}</option>
          <option value="tool-call">{t('settings.developer.filterToolCall')}</option>
          <option value="error">{t('settings.developer.filterError')}</option>
        </select>

        <span className="text-[10px] flex-1" style={{ color: 'var(--text-muted)' }}>
          {t('settings.developer.entryCount', { count: filtered.length })}
        </span>

        <button
          onClick={clear}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Trash2 size={12} />
          {t('settings.developer.clear')}
        </button>
      </div>

      {/* Trace list */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--border-color)', maxHeight: 420, overflowY: 'auto' }}
      >
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('settings.developer.empty')}
            </p>
          </div>
        ) : (
          [...filtered].reverse().map((entry) => (
            <TraceEntryRow key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  )
}
