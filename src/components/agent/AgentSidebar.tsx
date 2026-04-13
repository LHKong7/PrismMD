import { useState, useRef, useEffect } from 'react'
import { Send, Square, Trash2, Bot, ChevronDown, Brain } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgentStore } from '../../store/agentStore'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore, DEFAULT_MODELS, type AIProvider } from '../../store/settingsStore'
import { ChatMessage, renderWithCitations } from './ChatMessage'
import { useReaderDomStore } from '../../store/readerDomStore'
import { clsx } from 'clsx'

export function AgentSidebar() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = useAgentStore((s) => s.messages)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const streamingContent = useAgentStore((s) => s.streamingContent)
  const pendingEvidence = useAgentStore((s) => s.pendingEvidence)
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

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
          <button onClick={clearMessages} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors" title={t('agent.clear')}>
            <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Privacy badge */}
      {privacyMode && (
        <div className="px-3 py-1.5 text-[10px] font-semibold text-center" style={{ backgroundColor: '#ef44441a', color: '#ef4444' }}>
          Privacy Mode - Local Models Only
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
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex items-center justify-center h-full px-4">
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {currentContent ? t('agent.placeholder') : t('agent.noDocument')}
            </p>
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
            <button onClick={stopGeneration} className="p-1.5 rounded-md" style={{ backgroundColor: 'var(--accent-color)' }} title={t('agent.stop')}>
              <Square size={14} color="#fff" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() || !hasApiKey} className="p-1.5 rounded-md disabled:opacity-30" style={{ backgroundColor: 'var(--accent-color)' }} title={t('agent.send')}>
              <Send size={14} color="#fff" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
