import { useEffect, useState, useCallback } from 'react'
import { MessageSquare, Plus, Trash2, Zap, ChevronDown, ChevronRight, FolderOpen, User, Bot, Maximize2, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSessionStore, type SessionSummary } from '../../store/sessionStore'
import { useAgentStore } from '../../store/agentStore'
import { clsx } from 'clsx'

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = Math.max(0, Math.floor(now - timestamp))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function AgentSessionsPanel() {
  const { t } = useTranslation()
  const sessions = useSessionStore((s) => s.sessions)
  const currentSessionId = useSessionStore((s) => s.currentSessionId)
  const loading = useSessionStore((s) => s.loading)
  const refreshSessions = useSessionStore((s) => s.refreshSessions)
  const createSession = useSessionStore((s) => s.createSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const loadSession = useAgentStore((s) => s.loadSession)
  const clearMessages = useAgentStore((s) => s.clearMessages)
  const [sessionDir, setSessionDir] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    refreshSessions()
    window.electronAPI.sessionGetDir().then(setSessionDir)
  }, [refreshSessions])

  const handleNewSession = async () => {
    clearMessages()
    await createSession()
  }

  const handleSwitch = async (sessionId: string) => {
    await loadSession(sessionId)
  }

  const handleDelete = async (sessionId: string) => {
    if (expandedId === sessionId) setExpandedId(null)
    await deleteSession(sessionId)
    await refreshSessions()
  }

  const handleToggleExpand = (sessionId: string) => {
    setExpandedId(expandedId === sessionId ? null : sessionId)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('settings.agentSessions.title')}
        </h3>
        <button
          onClick={handleNewSession}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Plus size={13} />
          {t('settings.agentSessions.newSession')}
        </button>
      </div>
      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
        {t('settings.agentSessions.description')}
      </p>

      {/* Storage directory */}
      {sessionDir && (
        <div
          className="flex items-center gap-2 mb-4 px-3 py-2 rounded-md border text-[11px] font-mono"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <FolderOpen size={12} className="flex-shrink-0" />
          <span className="truncate" title={sessionDir}>{sessionDir}</span>
        </div>
      )}

      {sessions.length === 0 && !loading && (
        <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--border-color)' }}>
          <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.agentSessions.emptyTitle')}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('settings.agentSessions.emptyDescription')}
          </p>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isCurrent={session.id === currentSessionId}
              isExpanded={expandedId === session.id}
              sessionDir={sessionDir}
              loading={loading}
              onToggleExpand={() => handleToggleExpand(session.id)}
              onSwitch={() => handleSwitch(session.id)}
              onDelete={() => handleDelete(session.id)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({
  session, isCurrent, isExpanded, sessionDir, loading,
  onToggleExpand, onSwitch, onDelete, t,
}: {
  session: SessionSummary
  isCurrent: boolean
  isExpanded: boolean
  sessionDir: string
  loading: boolean
  onToggleExpand: () => void
  onSwitch: () => void
  onDelete: () => void
  t: (key: string, vars?: Record<string, unknown>) => string
}) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }> | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (isExpanded && !messages) {
      setLoadingHistory(true)
      window.electronAPI.sessionGetHistory(session.id)
        .then((history) => setMessages(history ?? []))
        .catch(() => setMessages([]))
        .finally(() => setLoadingHistory(false))
    }
  }, [isExpanded, session.id, messages])

  const filePath = sessionDir ? `${sessionDir}/${session.id}.json` : session.id

  return (
    <div
      className={clsx(
        'rounded-lg border transition-colors overflow-hidden',
        isCurrent && 'ring-1',
      )}
      style={{
        borderColor: isCurrent ? 'var(--accent-color)' : 'var(--border-color)',
        ...(isCurrent ? { '--tw-ring-color': 'var(--accent-color)' } as React.CSSProperties : {}),
      }}
    >
      {/* Header row */}
      <div className="group flex items-start gap-3 p-3 cursor-pointer" onClick={onToggleExpand}>
        {/* Expand chevron */}
        <div className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        {/* Icon */}
        {session.source === 'horse-mode' ? (
          <Zap size={14} className="mt-0.5 flex-shrink-0" style={{ color: isCurrent ? 'var(--accent-color)' : '#8b5cf6' }} />
        ) : (
          <MessageSquare size={14} className="mt-0.5 flex-shrink-0" style={{ color: isCurrent ? 'var(--accent-color)' : 'var(--text-muted)' }} />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {session.preview || t('settings.agentSessions.noPreview')}
            </span>
            {session.source === 'horse-mode' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ backgroundColor: '#8b5cf6', color: '#fff' }}>
                {t('settings.agentSessions.sourceHorseMode')}
              </span>
            )}
            {isCurrent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}>
                {t('settings.agentSessions.current')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>{session.source === 'horse-mode' ? t('settings.agentSessions.sourceHorseMode') : t('settings.agentSessions.sourceChat')}</span>
            <span>·</span>
            <span>{t('settings.agentSessions.turns', { count: session.turns })}</span>
            <span>·</span>
            <span>{formatRelativeTime(session.updatedAt)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {!isCurrent && (
            <button
              onClick={onSwitch}
              disabled={loading}
              className="text-[11px] px-2 py-1 rounded border transition-colors hover:bg-black/5 dark:hover:bg-white/5 opacity-0 group-hover:opacity-100 disabled:opacity-50"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              {t('settings.agentSessions.switch')}
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={loading}
            className="p-1 rounded transition-opacity hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 disabled:opacity-50"
            title={t('settings.agentSessions.delete')}
          >
            <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div
          className="border-t px-4 py-3 space-y-3"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* File path */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              {t('settings.agentSessions.filePath')}
            </div>
            <div
              className="text-[11px] font-mono px-2 py-1.5 rounded border truncate"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
              title={filePath}
            >
              {filePath}
            </div>
          </div>

          {/* Session ID */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              ID
            </div>
            <div
              className="text-[11px] font-mono px-2 py-1.5 rounded border"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
            >
              {session.id}
            </div>
          </div>

          {/* Messages */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              {t('settings.agentSessions.messages')}
            </div>
            {loadingHistory && (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>Loading...</p>
            )}
            {!loadingHistory && messages && messages.length === 0 && (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
                {t('settings.agentSessions.noPreview')}
              </p>
            )}
            {!loadingHistory && messages && messages.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {messages.map((msg, idx) => (
                  <MessageBlock key={idx} role={msg.role} content={msg.content} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBlock({ role, content }: { role: string; content: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > 300

  return (
    <div
      className="rounded border p-2"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {role === 'user' ? (
            <User size={11} style={{ color: 'var(--accent-color)' }} />
          ) : (
            <Bot size={11} style={{ color: '#8b5cf6' }} />
          )}
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: role === 'user' ? 'var(--accent-color)' : '#8b5cf6' }}
          >
            {role}
          </span>
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
          >
            {expanded
              ? <Minimize2 size={11} style={{ color: 'var(--text-muted)' }} />
              : <Maximize2 size={11} style={{ color: 'var(--text-muted)' }} />}
          </button>
        )}
      </div>
      <div
        className={clsx(
          'text-xs whitespace-pre-wrap break-words',
          !expanded && isLong && 'line-clamp-6',
        )}
        style={{ color: 'var(--text-secondary)' }}
      >
        {content}
      </div>
      {!expanded && isLong && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] mt-1 hover:underline"
          style={{ color: 'var(--accent-color)' }}
        >
          Show more...
        </button>
      )}
    </div>
  )
}
