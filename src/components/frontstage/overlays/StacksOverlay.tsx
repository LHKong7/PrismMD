/**
 * StacksOverlay — 典藏书柜. Every workspace page is a pixel book whose spine
 * reflects its editorial metadata (status / genre / quality / length) via
 * bookSkin. Two panes: the shelf, and a detail panel to read/edit a book or
 * tag its status, genre and quality (which reshapes the spine live).
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, PenLine, BookOpen, Pencil, Star } from 'lucide-react'
import { useWorkspaceStore } from '../../../store/workspaceStore'
import { useEditorStore } from '../../../store/editorStore'
import { useUIStore } from '../../../store/uiStore'
import type { PageTreeNode } from '../../../types/electron'
import { bookSkin, STATUS_KEYS, GENRE_KEYS, type SkinInput } from '../bookSkin'

function flatten(nodes: PageTreeNode[], acc: PageTreeNode[] = []): PageTreeNode[] {
  for (const n of nodes) {
    if (!n.isFolder) acc.push(n)
    if (n.children?.length) flatten(n.children, acc)
  }
  return acc
}

const EMPTY_SKIN: SkinInput = { status: null, genre: null, quality: null, length: 0 }

interface StacksOverlayProps {
  onClose: () => void
  /** Pre-select this page (e.g. when opened by clicking a world book spine). */
  initialSelected?: string
}

export function StacksOverlay({ onClose, initialSelected }: StacksOverlayProps) {
  const { t } = useTranslation()
  const pageTree = useWorkspaceStore((s) => s.pageTree)
  const books = useMemo(() => flatten(pageTree), [pageTree])
  const [meta, setMeta] = useState<Record<string, SkinInput>>({})
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null)

  useEffect(() => {
    let alive = true
    void window.electronAPI.pageMetaList().then((list) => {
      if (!alive) return
      const map: Record<string, SkinInput> = {}
      for (const m of list) map[m.pageId] = { status: m.status, genre: m.genre, quality: m.quality, length: m.length }
      setMeta(map)
    })
    return () => {
      alive = false
    }
  }, [])

  const skinOf = (id: string): SkinInput => meta[id] ?? EMPTY_SKIN

  const patchMeta = (id: string, partial: Partial<SkinInput>) => {
    setMeta((m) => ({ ...m, [id]: { ...(m[id] ?? EMPTY_SKIN), ...partial } }))
    void window.electronAPI.pageMetaSet(id, {
      status: partial.status as string | null | undefined,
      genre: partial.genre as string | null | undefined,
      quality: partial.quality as number | null | undefined,
    })
  }

  const openFor = async (pageId: string, editing: boolean) => {
    // openPage → syncForActiveTab forces editing=true for text, so the
    // read/edit intent must be applied *after* the page is open.
    await useWorkspaceStore.getState().openPage(pageId)
    useEditorStore.getState().setEditing(editing)
    useUIStore.getState().setFrontStageActive(false)
    onClose()
  }

  const writeNew = async () => {
    const id = await useWorkspaceStore.getState().createPage(t('frontStage.untitled', '无题'), null)
    if (id) {
      useEditorStore.getState().setEditing(true)
      useUIStore.getState().setFrontStageActive(false)
    }
    onClose()
  }

  const sel = selected ? books.find((b) => b.id === selected) : null
  const selSkin = selected ? skinOf(selected) : EMPTY_SKIN

  return (
    <div className="fs-panel fs-panel-stacks" role="dialog" aria-modal="true">
      <div className="fs-panel-head">
        <div className="fs-panel-title">{t('frontStage.stacks.title', '典藏书柜 · The Stacks')}</div>
        <button className="fs-icon-btn" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <X size={16} />
        </button>
      </div>
      <div className="fs-panel-sub">{t('frontStage.stacks.sub', '抽一本书翻开阅读，或在书桌上写下新的一本。')}</div>

      {books.length === 0 ? (
        <div className="fs-empty">{t('frontStage.stacks.empty', '书柜还空着——去写字桌写下第一本书吧。')}</div>
      ) : (
        <div className="bk-body">
          <div className="bk-shelf">
            {books.map((b) => {
              const sk = bookSkin(skinOf(b.id))
              const on = selected === b.id
              return (
                <button
                  key={b.id}
                  className={`bk-spine${on ? ' on' : ''}${sk.hot ? ' hot' : ''}`}
                  data-material={sk.material}
                  style={{ width: sk.w, height: sk.h, opacity: sk.opacity, background: `linear-gradient(180deg, ${sk.top}, ${sk.base})` }}
                  onClick={() => setSelected(b.id)}
                  title={b.title}
                >
                  {sk.goldPct > 0 && <span className="bk-foil" style={{ height: `${Math.round(sk.goldPct * 100)}%` }} />}
                  <span className="bk-title">{b.icon ? `${b.icon} ` : ''}{b.title || t('frontStage.untitled', '无题')}</span>
                  {sk.badge === 'revise' && <span className="bk-badge">!</span>}
                </button>
              )
            })}
          </div>

          <div className="bk-detail">
            {!sel ? (
              <div className="bk-detail-empty">{t('bookSkin.pickHint', '点一本书,给它定状态、类型与品质,或翻开它。')}</div>
            ) : (
              <>
                <div className="bk-detail-title">{sel.icon ? `${sel.icon} ` : ''}{sel.title || t('frontStage.untitled', '无题')}</div>

                <div className="bk-field-label">{t('bookSkin.statusLabel', '状态')}</div>
                <div className="bk-chips">
                  {STATUS_KEYS.map((k) => (
                    <button
                      key={k}
                      className={`bk-chip${(selSkin.status ?? 'draft') === k ? ' on' : ''}`}
                      onClick={() => patchMeta(sel.id, { status: k })}
                    >
                      {t(`bookSkin.status.${k}`, k)}
                    </button>
                  ))}
                </div>

                <div className="bk-field-label">{t('bookSkin.genreLabel', '类型')}</div>
                <div className="bk-chips">
                  {GENRE_KEYS.map((k) => (
                    <button
                      key={k}
                      className={`bk-chip${selSkin.genre === k ? ' on' : ''}`}
                      onClick={() => patchMeta(sel.id, { genre: selSkin.genre === k ? null : k })}
                    >
                      {t(`bookSkin.genre.${k}`, k)}
                    </button>
                  ))}
                </div>

                <div className="bk-field-label">{t('bookSkin.qualityLabel', '品质')}</div>
                <div className="bk-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className={`bk-star${(selSkin.quality ?? 0) >= n ? ' on' : ''}`}
                      onClick={() => patchMeta(sel.id, { quality: selSkin.quality === n ? null : n })}
                      aria-label={`${n}`}
                    >
                      <Star size={18} fill={(selSkin.quality ?? 0) >= n ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>

                <div className="bk-detail-actions">
                  <button className="fs-btn" onClick={() => openFor(sel.id, false)}>
                    <BookOpen size={14} /> {t('bookSkin.read', '阅读')}
                  </button>
                  <button className="fs-btn fs-btn-primary" onClick={() => openFor(sel.id, true)}>
                    <Pencil size={14} /> {t('bookSkin.edit', '编辑')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="fs-panel-foot">
        <button className="fs-btn fs-btn-primary" onClick={writeNew}>
          <PenLine size={14} /> {t('frontStage.stacks.write', '写新书')}
        </button>
      </div>
    </div>
  )
}
