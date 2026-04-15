import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Trash2, Bot, ChevronDown, Brain, AlertTriangle, X, ArrowDown, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgentStore, type ChatMessage as ChatMessageType } from '../../store/agentStore'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore, DEFAULT_MODELS, type AIProvider } from '../../store/settingsStore'
import { useUIStore } from '../../store/uiStore'
import { ChatMessage, renderWithCitations } from './ChatMessage'
import { useReaderDomStore } from '../../store/readerDomStore'
import { Button } from '../ui/Button'
import { clsx } from 'clsx'

export function AgentSidebar() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /**
   * Smart auto-scroll: only pin to the bottom when the user is already
   * near the bottom. If they scroll up to read history we stop pinning
   * and surface a "new messages" chip so they can opt back in.
   * Previously the stream force-scrolled on every chunk, hijacking the
   * user's scroll mid-read.
   */
  const [stickToBottom, setStickToBottom] = useState(true)
  const [hasNewWhileDetached, setHasNewWhileDetached] = useState(false)

  const messages = useAgentStore((s) => s.messages)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const streamingContent = useAgentStore((s) => s.streamingContent)
  const pendingEvidence = useAgentStore((s) => s.pendingEvidence)
  const mcpWarning = useAgentStore((s) => s.mcpWarning)
  const dismissMcpWarning = useAgentStore((s) => s.dismissMcpWarning)
  const scrollToEvidence = useReaderDomStore((s) => s.scrollToEvidence)
  const sendMessage = useAgentStore((s) => s.sendMessage)
  const stopGeneration = useAgentStore((s) => s.stopGeneration)
  const clearMessages = useAgentStore((s) => s.clearMessages)
  const currentContent = useFileStore((s) => s.currentContent)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const providers = useSettingsStore((s) => s.providers)
  const privacyMode = useSettingsStore((s) => s.privacyMode)
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider)
  const setProviderConfig = useSettingsStore((s) => s.setProviderConfig)
  const openSettings = useUIStore((s) => s.openSettings)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    // 40px slack keeps "is at bottom" forgiving for sub-pixel rendering.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setStickToBottom(atBottom)
    if (atBottom) setHasNewWhileDetached(false)
  }, [])

  // Auto-scroll — only when the user hasn't scrolled away from the
  // bottom. When detached, we mark "new messages" so they can tap the
  // overlay to catch up.
  useEffect(() => {
    if (stickToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (messages.length > 0 || streamingContent) {
      setHasNewWhileDetached(true)
    }
  }, [messages, streamingContent, stickToBottom])

  const jumpToLatest = () => {
    setStickToBottom(true)
    setHasNewWhileDetached(false)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setInput('')
    sendMessage(trimmed, currentContent ?? undefined, currentFilePath ?? undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const activeConfig = activeProvider ? providers[activeProvider] : null
  const hasApiKey = activeProvider === 'ollama' || (activeConfig?.apiKey)

  return (
    <div
      className="h-full flex flex-col border-l"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <Bot size={14} style={{ color: 'var(--accent-color)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {t('agent.title')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <Brain size={10} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => exportConversationAsMarkdown(messages, currentFilePath, t)}
            disabled={messages.length === 0}
            title={t('agent.exportConversation')}
            aria-label={t('agent.exportConversation')}
          >
            <Download size={13} style={{ color: 'var(--text-muted)' }} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearMessages}
            title={t('agent.clear')}
            aria-label={t('agent.clear')}
          >
            <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
          </Button>
        </div>
      </div>

      {/* Privacy badge — tooltip explains which providers are blocked so
          users aren't left guessing which ones are still usable. */}
      {privacyMode && (
        <div
          className="px-3 py-1.5 text-[10px] font-semibold text-center"
          style={{ backgroundColor: '#ef44441a', color: '#ef4444' }}
          title={t('agent.privacyBadgeTooltip')}
        >
          {t('agent.privacyBadge')}
        </div>
      )}

      {/* MCP warning — surfaces when the main process couldn't attach
          MCP tools (previously silent). Dismissible so it doesn't become
          permanent chrome. */}
      {mcpWarning && (
        <div
          className="flex items-start gap-2 px-3 py-2 text-[11px] border-b"
          style={{
            backgroundColor: '#f59e0b14',
            color: '#b45309',
            borderColor: 'var(--border-color)',
          }}
          role="alert"
        >
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{mcpWarning}</span>
          <button
            onClick={dismissMcpWarning}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            aria-label={t('common.dismiss')}
            title={t('common.dismiss')}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Model picker */}
      <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        <button
          onClick={() => setShowModelPicker(!showModelPicker)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs border hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <span>{activeProvider ? `${activeProvider} / ${activeConfig?.model ?? ''}` : t('agent.selectProvider')}</span>
          <ChevronDown size={12} className={clsx('transition-transform', showModelPicker && 'rotate-180')} />
        </button>

        {showModelPicker && (
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {(['ollama', 'openai', 'anthropic', 'google', 'custom'] as AIProvider[]).map((p) => {
              const config = providers[p]
              if (p !== 'ollama' && !config.apiKey && !(p === 'custom' && config.baseUrl)) return null
              if (privacyMode && p !== 'ollama') return null
              if (p === 'custom' && !config.model) return null
              return (
                <div key={p} className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase px-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    {p}
                    {p === 'ollama' && <span className="text-green-600">LOCAL</span>}
                    {p === 'custom' && <span className="text-purple-500">CUSTOM</span>}
                  </p>
                  {p === 'custom' ? (
                    <button
                      onClick={() => { setActiveProvider(p); setShowModelPicker(false) }}
                      className={clsx(
                        'w-full text-left text-xs px-2 py-1.5 rounded transition-colors',
                        activeProvider === p ? 'font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                      style={{ color: activeProvider === p ? 'var(--accent-color)' : 'var(--text-secondary)' }}
                    >
                      {config.model}
                    </button>
                  ) : (
                    DEFAULT_MODELS[p].map((model) => (
                      <button
                        key={model}
                        onClick={() => { setActiveProvider(p); setProviderConfig(p, { model }); setShowModelPicker(false) }}
                        className={clsx(
                          'w-full text-left text-xs px-2 py-1.5 rounded transition-colors',
                          activeProvider === p && config.model === model ? 'font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5'
                        )}
                        style={{ color: activeProvider === p && config.model === model ? 'var(--accent-color)' : 'var(--text-secondary)' }}
                      >
                        {model}
                      </button>
                    ))
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto relative" ref={scrollRef} onScroll={onScroll}>
        {hasNewWhileDetached && (
          <button
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium shadow-md focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            style={{
              backgroundColor: 'var(--accent-color)',
              color: '#fff',
            }}
            aria-label={t('agent.jumpToLatest')}
          >
            <ArrowDown size={12} />
            {t('agent.newMessages')}
          </button>
        )}
        {messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full px-4 gap-3">
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {!hasApiKey
                ? t('agent.onboardingHint')
                : currentContent ? t('agent.placeholder') : t('agent.noDocument')}
            </p>
            {!hasApiKey && (
              <Button
                variant="primary"
                size="md"
                onClick={() => openSettings('ai')}
                className="font-medium"
              >
                <Bot size={12} />
                {t('agent.configureProvider')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isStreaming && streamingContent && (
              <div className="flex gap-2.5 px-4 py-3 bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <Bot size={14} style={{ color: 'var(--accent-color)' }} />
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>
                  {renderWithCitations(streamingContent, pendingEvidence, (ev) =>
                    scrollToEvidence(ev.text),
                  )}
                  <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse" style={{ backgroundColor: 'var(--accent-color)' }} />
                </div>
              </div>
            )}
            {isStreaming && !streamingContent && (
              <div className="flex gap-2.5 px-4 py-3">
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <Bot size={14} className="animate-pulse" style={{ color: 'var(--accent-color)' }} />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('agent.thinking')}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-end gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? t('agent.placeholder') : t('agent.selectProvider')}
            disabled={!hasApiKey}
            rows={1}
            className="flex-1 text-sm bg-transparent outline-none resize-none max-h-24 disabled:opacity-50"
            style={{ color: 'var(--text-primary)' }}
          />
          {isStreaming ? (
            <Button
              variant="primary"
              size="icon"
              onClick={stopGeneration}
              className="p-1.5 rounded-md"
              title={t('agent.stop')}
              aria-label={t('agent.stop')}
            >
              <Square size={14} />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || !hasApiKey}
              className="p-1.5 rounded-md"
              title={t('agent.send')}
              aria-label={t('agent.send')}
            >
              <Send size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Render the current conversation as a Markdown document and trigger a
 * browser download. Format favors human-readability + dogfooding —
 * PrismMD itself can re-open the resulting `.md` file. Citations are
 * preserved as a "Sources" list per assistant turn so context isn't lost.
 */
function exportConversationAsMarkdown(
  messages: ChatMessageType[],
  filePath: string | null,
  t: (key: string, vars?: Record<string, unknown>) => string,
): void {
  if (messages.length === 0) return
  const baseName = filePath ? filePath.split(/[/\\]/).pop() ?? 'document' : 'untitled'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const lines: string[] = []
  lines.push(`# ${t('agent.title')} — ${baseName}`)
  lines.push('')
  lines.push(`_${new Date().toLocaleString()}_`)
  lines.push('')

  for (const msg of messages) {
    const heading = msg.role === 'user' ? t('chat.you') : t('chat.assistant')
    const meta = msg.model ? ` (${msg.model})` : ''
    lines.push(`## ${heading}${meta}`)
    lines.push('')
    lines.push(msg.content || '')
    lines.push('')
    if (msg.evidence && msg.evidence.length > 0) {
      lines.push(`**${t('chat.sources')}:**`)
      for (const ev of msg.evidence) {
        lines.push(`- [${ev.index}] ${ev.text}`)
      }
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prismmd-chat-${baseName.replace(/\.[^.]+$/, '')}-${stamp}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke async so the browser has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
