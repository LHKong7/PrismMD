/**
 * NpcDialog — talk to a scribe. Each turn is sent to the agent one-shot with
 * the NPC's persona as the system prompt, plus the current article as context,
 * so the scribe answers in-character about the open document.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Send, Settings2 } from 'lucide-react'
import { getNpc } from '../npcs'
import { useWorkspaceStore } from '../../../store/workspaceStore'
import { useSettingsStore } from '../../../store/settingsStore'
import { useUIStore } from '../../../store/uiStore'

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  error?: boolean
}

interface NpcDialogProps {
  npcId: string
  onClose: () => void
}

const DOC_LIMIT = 6000

export function NpcDialog({ npcId, onClose }: NpcDialogProps) {
  const { t } = useTranslation()
  const npc = getNpc(npcId)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const [turns, setTurns] = useState<ChatTurn[]>(
    npc ? [{ role: 'assistant', content: npc.greeting }] : [],
  )
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, busy])

  if (!npc) return null

  const configureAI = () => {
    useUIStore.getState().setFrontStageActive(false)
    useUIStore.getState().openSettings()
    onClose()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    const history = turns
    const nextTurns: ChatTurn[] = [...history, { role: 'user', content: text }]
    setTurns(nextTurns)
    setInput('')
    setBusy(true)

    const doc = useWorkspaceStore.getState().currentContent
    const transcript = history
      .map((m) => (m.role === 'user' ? '用户：' : `${npc.name}：`) + m.content)
      .join('\n')
    const docBlock = doc
      ? `【当前文章节选】\n${doc.slice(0, DOC_LIMIT)}\n\n`
      : ''
    const prompt = `${docBlock}${transcript ? transcript + '\n' : ''}用户：${text}`

    try {
      const res = await window.electronAPI.sendAgentOneShot({
        prompt,
        systemPrompt: npc.systemPrompt,
      })
      if (res.ok) {
        setTurns((cur) => [...cur, { role: 'assistant', content: res.result.reply }])
      } else {
        setTurns((cur) => [...cur, { role: 'assistant', content: res.error, error: true }])
      }
    } catch (e) {
      setTurns((cur) => [
        ...cur,
        { role: 'assistant', content: e instanceof Error ? e.message : String(e), error: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fs-panel fs-panel-npc" role="dialog" aria-modal="true">
      <div className="fs-panel-head">
        <div className="fs-npc-id">
          <div
            className="fs-npc-avatar"
            style={{ width: 40, height: 40, borderRadius: 8, background: npc.accent, display: 'grid', placeItems: 'center', color: '#fff4ea', fontSize: 18, fontWeight: 700, border: '2px solid rgba(0,0,0,0.25)' }}
          >
            {npc.name.slice(0, 1)}
          </div>
          <div>
            <div className="fs-panel-title">
              {npc.name} <span className="fs-npc-latin">· {npc.latin}</span>
            </div>
            <div className="fs-npc-ability" style={{ color: npc.accent }}>{npc.ability}</div>
          </div>
        </div>
        <button className="fs-icon-btn" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <X size={16} />
        </button>
      </div>

      {!activeProvider ? (
        <div className="fs-npc-config">
          <p>{t('frontStage.npc.noAI', '还没有配置 AI 模型，贤者暂时无法开口。')}</p>
          <button className="fs-btn fs-btn-primary" onClick={configureAI}>
            <Settings2 size={14} /> {t('frontStage.npc.configure', '去配置 AI')}
          </button>
        </div>
      ) : (
        <>
          <div className="fs-chat-log" ref={logRef}>
            {turns.map((m, i) => (
              <div key={i} className={`fs-msg fs-msg-${m.role}${m.error ? ' fs-msg-error' : ''}`}>
                {m.role === 'assistant' && !m.error && <span className="fs-msg-who">{npc.name}</span>}
                <div className="fs-msg-body">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="fs-msg fs-msg-assistant">
                <span className="fs-msg-who">{npc.name}</span>
                <div className="fs-msg-body fs-thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <div className="fs-chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={t('frontStage.npc.placeholder', `问问${npc.name}…`)}
              disabled={busy}
              autoFocus
            />
            <button className="fs-btn fs-btn-primary" onClick={() => void send()} disabled={busy || !input.trim()}>
              <Send size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
