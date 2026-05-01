import { useState } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info'
  args: string[]
  timestamp: number
}

interface Props {
  entries: ConsoleEntry[]
  onClear: () => void
}

const LEVEL_COLORS: Record<string, string> = {
  log: 'var(--text-primary)',
  info: 'var(--color-info)',
  warn: 'var(--color-warning)',
  error: 'var(--color-error)',
}

const MAX_VISIBLE = 100

export function SandboxConsole({ entries, onClear }: Props) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  const visible = entries.slice(0, MAX_VISIBLE)
  const overflow = entries.length - MAX_VISIBLE

  return (
    <div
      className="border-t text-xs"
      style={{ borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1 cursor-pointer select-none"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="font-medium">{t('sandbox.console')}</span>
          {entries.length > 0 && (
            <span className="ml-1 opacity-60">({entries.length})</span>
          )}
        </div>
        {entries.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="p-0.5 rounded transition-colors hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            title={t('sandbox.consoleClear')}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Entries */}
      {!collapsed && (
        <div
          className="max-h-40 overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {visible.length === 0 && (
            <div className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
              —
            </div>
          )}
          {visible.map((entry, i) => (
            <div
              key={i}
              className="px-3 py-0.5 font-mono border-b"
              style={{
                color: LEVEL_COLORS[entry.level],
                borderColor: 'var(--border-color)',
                opacity: entry.level === 'log' ? 0.9 : 1,
              }}
            >
              {entry.args.join(' ')}
            </div>
          ))}
          {overflow > 0 && (
            <div className="px-3 py-1" style={{ color: 'var(--text-muted)' }}>
              {t('sandbox.consoleOverflow', { count: overflow })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
