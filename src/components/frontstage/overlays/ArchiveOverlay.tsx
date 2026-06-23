/**
 * ArchiveOverlay — 档案柜 / The Archive. Version history for the current page:
 * list snapshots, diff a snapshot against the live document, restore one (which
 * first archives the current content), or snapshot the current content by hand.
 *
 * Snapshots are persisted in SQLite via the version IPC API; the Round Table
 * archives the pre-rewrite content automatically before applying changes.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Archive, RotateCcw, Save, Trash2, FileClock } from 'lucide-react'
import { useWorkspaceStore } from '../../../store/workspaceStore'
import { useEditorStore } from '../../../store/editorStore'
import type { VersionMeta, VersionFull } from '../../../types/electron'

interface ArchiveOverlayProps {
  onClose: () => void
}

type DiffLine = { type: 'eq' | 'add' | 'del'; text: string }

const DIFF_LINE_CAP = 1500

function lineDiff(oldText: string, newText: string): DiffLine[] | null {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  if (a.length > DIFF_LINE_CAP || b.length > DIFF_LINE_CAP) return null
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'eq', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}

function ago(t: (k: string, d: string) => string, ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60) return t('archive.justNow', '刚刚')
  if (s < 3600) return `${Math.floor(s / 60)} ${t('archive.minAgo', '分钟前')}`
  if (s < 86400) return `${Math.floor(s / 3600)} ${t('archive.hrAgo', '小时前')}`
  return `${Math.floor(s / 86400)} ${t('archive.dayAgo', '天前')}`
}

function sourceMeta(source: string): { label: string; color: string } {
  switch (source) {
    case 'round-table':
      return { label: '圆桌', color: '#6a5aa0' }
    case 'restore':
      return { label: '恢复', color: '#3a7196' }
    case 'edit':
      return { label: '编辑', color: '#5b8b4e' }
    default:
      return { label: '手动', color: '#c97a2a' }
  }
}

export function ArchiveOverlay({ onClose }: ArchiveOverlayProps) {
  const { t } = useTranslation()
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const currentTitle = useWorkspaceStore((s) => s.currentTitle)
  const currentContent = useWorkspaceStore((s) => s.currentContent)

  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [selected, setSelected] = useState<VersionFull | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!currentPageId) return
    try {
      const list = await window.electronAPI.versionList(currentPageId)
      setVersions(list)
    } catch {
      setVersions([])
    }
  }, [currentPageId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pick = async (id: string) => {
    setNote(null)
    try {
      const full = await window.electronAPI.versionGet(id)
      setSelected(full)
    } catch {
      setSelected(null)
    }
  }

  const snapshotCurrent = async () => {
    if (!currentPageId || busy) return
    setBusy(true)
    setNote(null)
    try {
      await window.electronAPI.versionSave(currentPageId, currentContent ?? '', {
        title: currentTitle,
        source: 'manual',
        label: t('archive.manualLabel', '手动存档'),
      })
      await refresh()
      setNote(t('archive.snapped', '已存档当前版本'))
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    if (!selected || !currentPageId || busy) return
    setBusy(true)
    setNote(null)
    try {
      // Archive the live content first, so the restore is itself reversible.
      await window.electronAPI.versionSave(currentPageId, currentContent ?? '', {
        title: currentTitle,
        source: 'restore',
        label: t('archive.beforeRestore', '恢复前'),
      })
      await useWorkspaceStore.getState().savePage(currentPageId, selected.content)
      useEditorStore.getState().loadExternalContent(selected.content)
      await refresh()
      setSelected(null)
      setNote(t('archive.restored', '已恢复该版本'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    await window.electronAPI.versionDelete(id)
    if (selected?.id === id) setSelected(null)
    await refresh()
  }

  const diff = selected ? lineDiff(selected.content, currentContent ?? '') : null
  const addCount = diff ? diff.filter((d) => d.type === 'add').length : 0
  const delCount = diff ? diff.filter((d) => d.type === 'del').length : 0

  let detail: React.ReactNode
  if (!currentPageId) {
    detail = <div className="fs-empty">{t('archive.noDoc', '先打开一篇文章,再来看它的版本史。')}</div>
  } else if (!selected) {
    detail = (
      <div className="arch-detail-empty">
        <FileClock size={26} />
        <p>{t('archive.pickHint', '选择左侧一个版本,查看它与当前文章的差异,或恢复它。')}</p>
      </div>
    )
  } else {
    detail = (
      <div className="arch-detail">
        <div className="arch-detail-head">
          <div>
            <span className="arch-src" style={{ background: sourceMeta(selected.source).color }}>{sourceMeta(selected.source).label}</span>
            <span className="arch-detail-label">{selected.label || t('archive.snapshot', '快照')}</span>
          </div>
          <div className="arch-detail-actions">
            <button className="fs-btn" disabled={busy} onClick={() => remove(selected.id)}>
              <Trash2 size={13} /> {t('archive.delete', '删除')}
            </button>
            <button className="fs-btn fs-btn-primary" disabled={busy} onClick={restore}>
              <RotateCcw size={13} /> {t('archive.restore', '恢复此版本')}
            </button>
          </div>
        </div>
        <div className="arch-diff-stat">
          {diff ? (
            <>
              <span className="arch-add">+{addCount}</span> <span className="arch-del">−{delCount}</span>{' '}
              <span className="arch-diff-note">{t('archive.diffNote', '（相对当前文章）')}</span>
            </>
          ) : (
            <span className="arch-diff-note">{t('archive.diffTooBig', '文档较大,略过逐行对比。')}</span>
          )}
        </div>
        <div className="arch-diff">
          {diff ? (
            diff.map((d, i) => (
              <div key={i} className={`arch-line arch-${d.type}`}>
                <span className="arch-gutter">{d.type === 'add' ? '+' : d.type === 'del' ? '−' : ''}</span>
                <span className="arch-line-text">{d.text || ' '}</span>
              </div>
            ))
          ) : (
            <pre className="arch-raw">{selected.content.slice(0, 4000)}</pre>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fs-panel fs-panel-arch" role="dialog" aria-modal="true">
      <div className="fs-panel-head">
        <div className="fs-panel-title">
          <Archive size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          {t('archive.title', '档案柜 · 版本史')}
        </div>
        <button className="fs-icon-btn" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <X size={16} />
        </button>
      </div>

      <div className="arch-sub">
        <span>{t('archive.doc', '文章')}：<b>{currentTitle || t('frontStage.untitled', '无题')}</b></span>
        {currentPageId && (
          <button className="fs-btn" disabled={busy} onClick={snapshotCurrent}>
            <Save size={13} /> {t('archive.snapshotNow', '存档当前')}
          </button>
        )}
      </div>
      {note && <div className="arch-note">{note}</div>}

      <div className="arch-body">
        <div className="arch-list">
          {versions.length === 0 ? (
            <div className="fs-empty arch-list-empty">{t('archive.empty', '还没有存档。圆桌改写或手动存档后,会出现在这里。')}</div>
          ) : (
            versions.map((v) => {
              const sm = sourceMeta(v.source)
              return (
                <button
                  key={v.id}
                  className={`arch-item${selected?.id === v.id ? ' on' : ''}`}
                  onClick={() => pick(v.id)}
                >
                  <span className="arch-item-top">
                    <span className="arch-src" style={{ background: sm.color }}>{sm.label}</span>
                    <span className="arch-time">{ago(t, v.createdAt)}</span>
                  </span>
                  <span className="arch-item-label">{v.label || t('archive.snapshot', '快照')}</span>
                  <span className="arch-item-len">{v.length} {t('archive.chars', '字')}</span>
                </button>
              )
            })
          )}
        </div>
        <div className="arch-detail-wrap">{detail}</div>
      </div>
    </div>
  )
}
