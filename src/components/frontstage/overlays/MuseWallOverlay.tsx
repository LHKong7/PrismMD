/**
 * MuseWallOverlay — 灵感墙. A board of inspiration cards (topics / golden lines /
 * snippets / opening candidates). Add cards by hand, or have an agent generate
 * a batch seeded by the current document. Cards persist globally in SQLite.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Sparkles, Copy, Check, Trash2, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '../../../store/workspaceStore'
import { useSettingsStore } from '../../../store/settingsStore'
import type { MuseCard } from '../../../types/electron'

const KINDS = ['topic', 'quote', 'snippet', 'opening'] as const
type Kind = (typeof KINDS)[number]

const KIND_COLOR: Record<string, string> = {
  topic: '#3a7196',
  quote: '#6a5aa0',
  snippet: '#5b8b4e',
  opening: '#c97a2a',
}

const AI_ASK: Record<Kind, string> = {
  topic: '围绕上面的内容,给我 5 个可以写的选题方向,每个一句话。',
  quote: '从上面的内容里挑选或提炼 5 句可作金句的句子。',
  snippet: '给我 4 条与上面内容相关的素材 / 论据角度,每条一句话。',
  opening: '给上面这篇文章写 4 个不同风格的开头候选,每个 1–2 句。',
}

const ITEMS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: { items: { type: 'array', items: { type: 'string' } } },
}

function safeParse(s: string): unknown {
  const cleaned = s.replace(/```json|```/gi, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* try object/array slice */
  }
  const m = cleaned.match(/[[{][\s\S]*[\]}]/)
  if (m) {
    try {
      return JSON.parse(m[0])
    } catch {
      /* give up */
    }
  }
  return null
}

function extractItems(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: unknown[] }).items.map(String)
  }
  return []
}

interface MuseWallOverlayProps {
  onClose: () => void
}

export function MuseWallOverlay({ onClose }: MuseWallOverlayProps) {
  const { t } = useTranslation()
  const activeProvider = useSettingsStore((s) => s.activeProvider)

  const [cards, setCards] = useState<MuseCard[]>([])
  const [kind, setKind] = useState<Kind>('topic')
  const [text, setText] = useState('')
  const [aiBusy, setAiBusy] = useState<Kind | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mounted = useRef(true)
  const submitting = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.museList()
      if (mounted.current) setCards(list)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addManual = async () => {
    if (submitting.current) return
    const body = text.trim()
    if (!body) return
    submitting.current = true
    setText('')
    try {
      const pageId = useWorkspaceStore.getState().currentPageId
      await window.electronAPI.museAdd(kind, body, pageId)
      await refresh()
    } finally {
      submitting.current = false
    }
  }

  const remove = async (id: string) => {
    await window.electronAPI.museDelete(id)
    await refresh()
  }

  const copy = (card: MuseCard) => {
    if (!navigator.clipboard) return
    void navigator.clipboard
      .writeText(card.text)
      .then(() => {
        if (!mounted.current) return
        setCopiedId(card.id)
        window.setTimeout(() => {
          if (mounted.current) setCopiedId((c) => (c === card.id ? null : c))
        }, 1200)
      })
      .catch(() => {})
  }

  const aiGenerate = async (k: Kind) => {
    if (aiBusy) return
    setAiBusy(k)
    setNotice(null)
    const doc = useWorkspaceStore.getState().currentContent ?? ''
    const title = useWorkspaceStore.getState().currentTitle ?? ''
    const seed = doc
      ? `【文章标题】${title}\n【正文节选】\n${doc.slice(0, 4000)}`
      : '（暂无打开的文章,请给出通用的写作灵感。）'
    try {
      const res = await window.electronAPI.sendAgentOneShot({
        prompt: `${seed}\n\n${AI_ASK[k]}\n请用 JSON 数组(字段 items)输出。`,
        systemPrompt: '你是一位写作灵感助手,产出简短、具体、可直接使用的灵感条目,不要客套或解释。',
        jsonSchema: ITEMS_SCHEMA,
      })
      let items: string[] = []
      if (res.ok) items = extractItems(res.result.json ?? safeParse(res.result.reply))
      const pageId = useWorkspaceStore.getState().currentPageId
      let added = 0
      for (const it of items.slice(0, 6)) {
        const body = it.trim()
        if (body) {
          await window.electronAPI.museAdd(k, body, pageId)
          added++
        }
      }
      await refresh()
      if (mounted.current && added === 0) setNotice(t('muse.aiError', 'AI 暂时没给出灵感，稍后再试。'))
    } catch {
      if (mounted.current) setNotice(t('muse.aiError', 'AI 暂时没给出灵感，稍后再试。'))
    } finally {
      if (mounted.current) setAiBusy(null)
    }
  }

  return (
    <div className="fs-panel fs-panel-muse" role="dialog" aria-modal="true">
      <div className="fs-panel-head">
        <div className="fs-panel-title">
          <Sparkles size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          {t('muse.title', '灵感墙')}
        </div>
        <button className="fs-icon-btn" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <X size={16} />
        </button>
      </div>
      <div className="fs-panel-sub">{t('muse.sub', '收集选题、金句、素材与开头;也可以让 AI 替你想几个。')}</div>

      <div className="muse-compose">
        <div className="muse-kinds">
          {KINDS.map((k) => (
            <button
              key={k}
              className={`muse-kind${kind === k ? ' on' : ''}`}
              style={kind === k ? { borderColor: KIND_COLOR[k], color: KIND_COLOR[k] } : undefined}
              onClick={() => setKind(k)}
            >
              {t(`muse.kind.${k}`, k)}
            </button>
          ))}
        </div>
        <div className="muse-add-row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addManual()
              }
            }}
            placeholder={t('muse.placeholder', '写下一条灵感,回车添加…')}
          />
          <button className="fs-btn" onClick={() => void addManual()} disabled={!text.trim()}>
            <Plus size={14} /> {t('muse.add', '添加')}
          </button>
          <button
            className="fs-btn fs-btn-primary"
            onClick={() => void aiGenerate(kind)}
            disabled={!activeProvider || aiBusy !== null}
            title={!activeProvider ? t('muse.noAI', '未配置 AI') : ''}
          >
            {aiBusy !== null ? <Loader2 size={14} className="rt-spin" /> : <Sparkles size={14} />} {t('muse.ai', 'AI 灵感')}
          </button>
        </div>
      </div>

      {notice && <div className="muse-notice">{notice}</div>}

      <div className="muse-grid">
        {cards.length === 0 ? (
          <div className="fs-empty">{t('muse.empty', '灵感墙还空着。手动写一条,或点「AI 灵感」让贤者帮你起个头。')}</div>
        ) : (
          cards.map((c) => (
            <div key={c.id} className="muse-card">
              <span className="muse-card-kind" style={{ background: KIND_COLOR[c.kind] ?? '#7a5e3e' }}>
                {t(`muse.kind.${c.kind}`, c.kind)}
              </span>
              <div className="muse-card-text">{c.text}</div>
              <div className="muse-card-actions">
                <button className="muse-icon" onClick={() => copy(c)} aria-label={t('muse.copy', '复制')}>
                  {copiedId === c.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <button className="muse-icon" onClick={() => void remove(c.id)} aria-label={t('muse.delete', '删除')}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
