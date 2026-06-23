/**
 * RoundTableOverlay — 写作圆桌. Invite several scribes to critique the current
 * document at once, let a "chair" agent merge their notes into a prioritised,
 * de-duplicated checklist, then apply the accepted items to produce a new
 * version of the document.
 *
 * Pipeline: critique (N concurrent sendAgentOneShot) → synthesize (1 call,
 * JSON checklist) → user selects → apply (1 call → revised markdown) → save.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Users, Sparkles, Check, RefreshCw, BookOpen, Settings2, Loader2 } from 'lucide-react'
import { NPCS } from '../npcs'
import { useWorkspaceStore } from '../../../store/workspaceStore'
import { useEditorStore } from '../../../store/editorStore'
import { useSettingsStore } from '../../../store/settingsStore'
import { useUIStore } from '../../../store/uiStore'

type Phase = 'setup' | 'discussing' | 'plan' | 'applying' | 'done'
type Priority = 'high' | 'med' | 'low'

interface Critique {
  status: 'pending' | 'done' | 'error'
  text: string
}

interface PlanItem {
  id: string
  title: string
  detail: string
  sources: string[]
  priority: Priority
}

const ALL_IDS = ['olive', 'dorian', 'vera', 'sela', 'manny', 'sage', 'grim', 'muse']
const DEFAULT_PANEL = ['olive', 'vera', 'sela', 'manny', 'sage']
const DOC_LIMIT = 6000
const APPLY_LIMIT = 16000

const CHAIR_PROMPT =
  '你是「写作圆桌」的主持人(The Chair)。你不发表自己的写作意见,只负责把多位贤者的意见去重、合并、按优先级整理成一份精炼、可执行的修改清单——避免让作者被太多建议淹没,只挑真正重要的,最多 8 条。每条给出:简短标题(title)、具体怎么改(detail)、来自哪几位贤者(sources)、优先级(priority: high/med/low)。'
const APPLY_PROMPT =
  '你是一位资深编辑。根据给定的修改清单改写文章,只输出改写后的完整 markdown 正文,不要任何解释、前言或代码围栏。保持作者原意与整体风格,只做清单要求的改动。'

function critiquePrompt(doc: string, ability: string): string {
  return (
    `你正在参加这篇文章的「写作圆桌」会诊。请**只从你的专业视角(${ability})**,挑出最关键的 2–4 个问题或改进点,` +
    `每条一句话、具体、可执行(指明哪里、怎么改)。不要客套、不要复述原文、不要超出你的职责。\n\n【文章】\n` +
    doc.slice(0, DOC_LIMIT)
  )
}

function safeParse(s: string): unknown {
  const cleaned = s.replace(/```json|```/gi, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* try to extract an object */
  }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      return JSON.parse(m[0])
    } catch {
      /* give up */
    }
  }
  return null
}

function stripFences(s: string): string {
  return s.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '').trim()
}

const SYNTH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'priority'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          priority: { type: 'string', enum: ['high', 'med', 'low'] },
        },
      },
    },
  },
}

interface RoundTableOverlayProps {
  onClose: () => void
  onGoStacks: () => void
}

export function RoundTableOverlay({ onClose, onGoStacks }: RoundTableOverlayProps) {
  const { t } = useTranslation()
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const currentTitle = useWorkspaceStore((s) => s.currentTitle)
  const activeProvider = useSettingsStore((s) => s.activeProvider)

  const [phase, setPhase] = useState<Phase>('setup')
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_PANEL))
  const [critiques, setCritiques] = useState<Record<string, Critique>>({})
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [appliedCount, setAppliedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const docText = () => useWorkspaceStore.getState().currentContent ?? ''

  const toggleScribe = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAccept = (id: string) =>
    setAccepted((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function synthesize(doc: string, crits: { name: string; text: string }[]): Promise<PlanItem[]> {
    const merged = crits.map((c) => `【${c.name}】\n${c.text}`).join('\n\n')
    const prompt =
      `【文章】\n${doc.slice(0, DOC_LIMIT)}\n\n【各位贤者的意见】\n${merged}\n\n` +
      '请把这些意见去重、合并、按优先级排成一份可执行修改清单(最多 8 条),用 JSON 输出。'
    try {
      const res = await window.electronAPI.sendAgentOneShot({ prompt, systemPrompt: CHAIR_PROMPT, jsonSchema: SYNTH_SCHEMA })
      if (res.ok) {
        const raw: unknown = res.result.json ?? safeParse(res.result.reply)
        const itemsRaw =
          raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
            ? (raw as { items: unknown[] }).items
            : []
        const items = itemsRaw.slice(0, 8).map((itU, n): PlanItem => {
          const it = (itU ?? {}) as Record<string, unknown>
          const pr = it.priority
          return {
            id: `p${n}`,
            title: String(it.title ?? `建议 ${n + 1}`),
            detail: String(it.detail ?? ''),
            sources: Array.isArray(it.sources) ? (it.sources as unknown[]).map(String) : [],
            priority: pr === 'high' || pr === 'med' || pr === 'low' ? pr : 'med',
          }
        })
        if (items.length) return items
      }
    } catch {
      /* fall through to heuristic */
    }
    // Fallback: one checklist item per scribe.
    return crits.slice(0, 8).map((c, n): PlanItem => ({
      id: `p${n}`,
      title: `${c.name}的意见`,
      detail: c.text.slice(0, 400),
      sources: [c.name],
      priority: 'med',
    }))
  }

  async function startSession() {
    setError(null)
    const ids = [...selected]
    if (!ids.length) return
    const doc = docText()
    const init: Record<string, Critique> = {}
    ids.forEach((id) => {
      init[id] = { status: 'pending', text: '' }
    })
    setCritiques(init)
    setPhase('discussing')

    const results = await Promise.all(
      ids.map(async (id) => {
        const npc = NPCS[id]
        try {
          const res = await window.electronAPI.sendAgentOneShot({
            prompt: critiquePrompt(doc, npc.ability),
            systemPrompt: npc.systemPrompt,
          })
          const ok = res.ok
          const text = ok ? res.result.reply : `（暂时无法应答：${res.error}）`
          if (mounted.current) setCritiques((c) => ({ ...c, [id]: { status: ok ? 'done' : 'error', text } }))
          return { name: npc.name, text: ok ? res.result.reply : '' }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (mounted.current) setCritiques((c) => ({ ...c, [id]: { status: 'error', text: `（出错：${msg}）` } }))
          return { name: npc.name, text: '' }
        }
      }),
    )

    if (!mounted.current) return
    const valid = results.filter((r) => r.text.trim())
    if (!valid.length) {
      setError(t('roundTable.empty', '贤者们暂时没给出意见,稍后再试。'))
      setPhase('setup')
      return
    }
    const items = await synthesize(doc, valid)
    if (!mounted.current) return
    setPlan(items)
    setAccepted(new Set(items.filter((i) => i.priority === 'high').map((i) => i.id)))
    setPhase('plan')
  }

  async function applySelected() {
    const items = plan.filter((i) => accepted.has(i.id))
    if (!items.length) return
    const doc = docText()
    // Whole-doc rewrite would truncate anything past APPLY_LIMIT — refuse rather
    // than silently overwrite the page with a shortened version.
    if (doc.length > APPLY_LIMIT) {
      setError(t('roundTable.tooLong', '这篇文章较长，圆桌暂不支持整篇自动改写（以免内容被截断）。'))
      return
    }
    setError(null)
    setPhase('applying')
    const list = items.map((it, n) => `${n + 1}. ${it.title}：${it.detail}`).join('\n')
    try {
      const res = await window.electronAPI.sendAgentOneShot({
        prompt: `【原文】\n${doc.slice(0, APPLY_LIMIT)}\n\n【修改清单】\n${list}\n\n请按清单改写,输出修改后的完整 markdown 正文。`,
        systemPrompt: APPLY_PROMPT,
      })
      if (!mounted.current) return
      if (res.ok) {
        const revised = stripFences(res.result.reply)
        const pageId = useWorkspaceStore.getState().currentPageId
        if (pageId) {
          // Archive the pre-rewrite content so it can be rolled back.
          try {
            await window.electronAPI.versionSave(pageId, doc, {
              title: useWorkspaceStore.getState().currentTitle,
              source: 'round-table',
              label: `圆桌改写前 · 应用 ${items.length} 条`,
            })
          } catch {
            /* archiving is best-effort */
          }
          await useWorkspaceStore.getState().savePage(pageId, revised)
          useEditorStore.getState().loadExternalContent(revised)
          // A round-tabled draft is a polished one — reflect it on the shelf.
          void window.electronAPI.pageMetaSet(pageId, { status: 'done' })
        }
        setAppliedCount(items.length)
        setPhase('done')
      } else {
        setError(res.error)
        setPhase('plan')
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('plan')
      }
    }
  }

  const reset = () => {
    setPhase('setup')
    setCritiques({})
    setPlan([])
    setAccepted(new Set())
    setError(null)
  }

  const configureAI = () => {
    useUIStore.getState().setFrontStageActive(false)
    useUIStore.getState().openSettings()
    onClose()
  }

  const goRead = () => {
    useEditorStore.getState().setEditing(false)
    useUIStore.getState().setFrontStageActive(false)
    onClose()
  }

  // ── Body ──
  let body: React.ReactNode

  if (!activeProvider) {
    body = (
      <div className="fs-npc-config">
        <p>{t('roundTable.noAI', '还没有配置 AI 模型,贤者无法开口。')}</p>
        <button className="fs-btn fs-btn-primary" onClick={configureAI}>
          <Settings2 size={14} /> {t('roundTable.configure', '去配置 AI')}
        </button>
      </div>
    )
  } else if (!currentPageId) {
    body = (
      <div className="fs-npc-config">
        <p>{t('roundTable.noDoc', '圆桌需要一篇文章。先去书柜打开一本,或在写字桌新建。')}</p>
        <button className="fs-btn fs-btn-primary" onClick={onGoStacks}>
          <BookOpen size={14} /> {t('roundTable.goStacks', '去书柜挑一本')}
        </button>
      </div>
    )
  } else if (phase === 'setup') {
    body = (
      <div className="rt-body">
        <div className="rt-doc">{t('roundTable.docLabel', '会诊文章')}：<b>{currentTitle || t('frontStage.untitled', '无题')}</b></div>
        <div className="rt-section-label">{t('roundTable.pick', '选择参加会诊的贤者')}</div>
        <div className="rt-scribes">
          {ALL_IDS.map((id) => {
            const npc = NPCS[id]
            const on = selected.has(id)
            return (
              <button
                key={id}
                className={`rt-chip${on ? ' on' : ''}`}
                style={on ? { borderColor: npc.accent, boxShadow: `inset 0 0 0 2px ${npc.accent}` } : undefined}
                onClick={() => toggleScribe(id)}
              >
                <span className="rt-chip-dot" style={{ background: npc.accent }} />
                <span className="rt-chip-name">{npc.name}</span>
                <span className="rt-chip-ability">{npc.ability}</span>
              </button>
            )
          })}
        </div>
        <div className="fs-panel-foot">
          <button className="fs-btn fs-btn-primary" disabled={selected.size === 0} onClick={startSession}>
            <Sparkles size={14} /> {t('roundTable.start', '开始会诊')}（{selected.size}）
          </button>
        </div>
      </div>
    )
  } else if (phase === 'discussing') {
    body = (
      <div className="rt-body">
        <div className="rt-discuss-note">{t('roundTable.discussing', '贤者们正在各抒己见…')}</div>
        <div className="rt-cards">
          {[...selected].map((id) => {
            const npc = NPCS[id]
            const c = critiques[id]
            return (
              <div key={id} className="rt-card" style={{ borderTopColor: npc.accent }}>
                <div className="rt-card-head">
                  <span className="rt-chip-dot" style={{ background: npc.accent }} />
                  {npc.name} <span className="rt-card-ability">{npc.ability}</span>
                </div>
                <div className="rt-card-body">
                  {!c || c.status === 'pending' ? (
                    <div className="fs-thinking"><span /><span /><span /></div>
                  ) : (
                    c.text
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  } else if (phase === 'plan') {
    const groups: { key: Priority; label: string }[] = [
      { key: 'high', label: t('roundTable.priorityHigh', '重点') },
      { key: 'med', label: t('roundTable.priorityMed', '其次') },
      { key: 'low', label: t('roundTable.priorityLow', '可选') },
    ]
    body = (
      <div className="rt-body">
        <div className="rt-plan-head">
          <div className="fs-panel-title-sm">{t('roundTable.planTitle', '圆桌共识 · 修改清单')}</div>
          <div className="rt-plan-hint">{t('roundTable.planHint', '勾选你想采纳的修改,生成新版本。')}</div>
        </div>
        <div className="rt-plan">
          {groups.map((g) => {
            const items = plan.filter((i) => i.priority === g.key)
            if (!items.length) return null
            return (
              <div key={g.key} className="rt-group">
                <div className={`rt-group-label rt-pri-${g.key}`}>{g.label}</div>
                {items.map((it) => {
                  const on = accepted.has(it.id)
                  return (
                    <button key={it.id} className={`rt-item${on ? ' on' : ''}`} onClick={() => toggleAccept(it.id)}>
                      <span className={`rt-check${on ? ' on' : ''}`}>{on && <Check size={13} />}</span>
                      <span className="rt-item-text">
                        <span className="rt-item-title">{it.title}</span>
                        {it.detail && <span className="rt-item-detail">{it.detail}</span>}
                        {it.sources.length > 0 && (
                          <span className="rt-item-src">{t('roundTable.sources', '来自')} {it.sources.join('、')}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        {error && <div className="rt-error">{error}</div>}
        <div className="fs-panel-foot rt-foot">
          <button className="fs-btn" onClick={reset}>
            <RefreshCw size={14} /> {t('roundTable.redo', '重新会诊')}
          </button>
          <button className="fs-btn fs-btn-primary" disabled={accepted.size === 0} onClick={applySelected}>
            <Sparkles size={14} /> {t('roundTable.apply', '应用所选')}（{accepted.size}）
          </button>
        </div>
      </div>
    )
  } else if (phase === 'applying') {
    body = (
      <div className="fs-npc-config">
        <Loader2 size={28} className="rt-spin" />
        <p>{t('roundTable.applying', '正在按清单改写文章…')}</p>
      </div>
    )
  } else {
    body = (
      <div className="fs-npc-config">
        <div className="rt-done-badge"><Check size={26} /></div>
        <p className="rt-done-title">{t('roundTable.doneTitle', '已生成新版本')}</p>
        <p className="rt-done-desc">{t('roundTable.applied', '已应用')} {appliedCount} {t('roundTable.changes', '条修改')}</p>
        <div className="rt-done-actions">
          <button className="fs-btn" onClick={reset}>{t('roundTable.again', '再来一轮')}</button>
          <button className="fs-btn fs-btn-primary" onClick={goRead}>
            <BookOpen size={14} /> {t('roundTable.read', '去阅读')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fs-panel fs-panel-rt" role="dialog" aria-modal="true">
      <div className="fs-panel-head">
        <div className="fs-panel-title">
          <Users size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          {t('roundTable.title', '写作圆桌')}
        </div>
        <button className="fs-icon-btn" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <X size={16} />
        </button>
      </div>
      {body}
    </div>
  )
}
