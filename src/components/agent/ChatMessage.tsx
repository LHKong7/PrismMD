import { Bot, User } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '../../store/agentStore'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-2.5 px-4 py-3 ${isUser ? '' : 'bg-black/[0.02] dark:bg-white/[0.02]'}`}>
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: isUser ? 'var(--accent-color)' : 'var(--bg-secondary)',
        }}
      >
        {isUser ? (
          <User size={14} color="#fff" />
        ) : (
          <Bot size={14} style={{ color: 'var(--accent-color)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {isUser ? 'You' : 'AI'}
          </span>
          {message.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              {message.model}
            </span>
          )}
        </div>
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: 'var(--text-secondary)' }}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}
