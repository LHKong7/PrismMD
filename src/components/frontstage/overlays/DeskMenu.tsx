/**
 * DeskMenu — 写字桌. Start a fresh article or jump back into the last one,
 * landing straight in the backstage editor (edit mode on).
 */

import { useTranslation } from 'react-i18next'
import { X, FilePlus2, RotateCcw } from 'lucide-react'
import { useWorkspaceStore } from '../../../store/workspaceStore'
import { useEditorStore } from '../../../store/editorStore'
import { useUIStore } from '../../../store/uiStore'

interface DeskMenuProps {
  onClose: () => void
}

export function DeskMenu({ onClose }: DeskMenuProps) {
  const { t } = useTranslation()
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const currentTitle = useWorkspaceStore((s) => s.currentTitle)

  const leaveToEditor = () => {
    useEditorStore.getState().setEditing(true)
    useUIStore.getState().setFrontStageActive(false)
    onClose()
  }

  const newArticle = async () => {
    const id = await useWorkspaceStore.getState().createPage(t('frontStage.untitled', '无题'), null)
    if (id) leaveToEditor()
    else onClose()
  }

  const continueRecent = () => {
    if (currentPageId) {
      void useWorkspaceStore.getState().openPage(currentPageId)
      leaveToEditor()
    } else {
      onClose()
    }
  }

  return (
    <div className="fs-panel fs-panel-desk" role="dialog" aria-modal="true">
      <div className="fs-panel-head">
        <div className="fs-panel-title">{t('frontStage.desk.title', '写字桌 · The Desk')}</div>
        <button className="fs-icon-btn" onClick={onClose} aria-label={t('common.close', '关闭')}>
          <X size={16} />
        </button>
      </div>
      <div className="fs-panel-sub">{t('frontStage.desk.sub', '摊开纸笔，开始一本新书；或继续手边那一篇。')}</div>

      <div className="fs-desk-actions">
        <button className="fs-card-btn" onClick={newArticle}>
          <FilePlus2 size={20} />
          <span className="fs-card-title">{t('frontStage.desk.new', '新建文章')}</span>
          <span className="fs-card-desc">{t('frontStage.desk.newDesc', '空白一页，从头写起')}</span>
        </button>
        <button className="fs-card-btn" onClick={continueRecent} disabled={!currentPageId}>
          <RotateCcw size={20} />
          <span className="fs-card-title">{t('frontStage.desk.continue', '继续手边这篇')}</span>
          <span className="fs-card-desc">
            {currentPageId ? (currentTitle || t('frontStage.untitled', '无题')) : t('frontStage.desk.none', '暂无打开的文章')}
          </span>
        </button>
      </div>
    </div>
  )
}
