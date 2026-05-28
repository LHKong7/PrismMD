import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Zap, FolderOpen, X, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useEditorStore } from '../../store/editorStore'
import { useHorseModeStore } from '../../store/horseModeStore'

interface Props {
  open: boolean
  onClose: () => void
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

export function HorseModeDialog({ open, onClose }: Props) {
  const { t } = useTranslation()
  const openFolders = useFileStore((s) => s.openFolders)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const currentContent = useFileStore((s) => s.currentContent)
  const editorContent = useEditorStore((s) => s.editorContent)
  const editing = useEditorStore((s) => s.editing)
  const start = useHorseModeStore((s) => s.start)

  const [task, setTask] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileNameManual, setFileNameManual] = useState(false)
  const [useDocContext, setUseDocContext] = useState(false)
  const [iterations, setIterations] = useState(1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasDocument = !!currentFilePath
  const currentFileName = currentFilePath?.split(/[/\\]/).pop() ?? ''
  // Use editor content if editing, otherwise reader content
  const documentContent = editing ? editorContent : currentContent

  // Default target directory to first open folder
  useEffect(() => {
    if (open && openFolders.length > 0 && !targetDir) {
      setTargetDir(openFolders[0].path)
    }
  }, [open, openFolders, targetDir])

  // Auto-generate filename from task
  useEffect(() => {
    if (!fileNameManual && task.trim()) {
      const slug = slugify(task) || 'untitled'
      setFileName(`${slug}.md`)
    }
  }, [task, fileNameManual])

  // Reset state on open
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50)
      setTask('')
      setFileName('')
      setFileNameManual(false)
      setUseDocContext(hasDocument)
      setIterations(1)
    }
  }, [open, hasDocument])

  // Dismiss on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSelectDir = async () => {
    try {
      const result = await window.electronAPI.openFolderDialog()
      if (result && !result.cancelled && result.folderPath) {
        setTargetDir(result.folderPath)
      }
    } catch { /* cancelled */ }
  }

  const handleStart = () => {
    if (!task.trim() || !targetDir || !fileName) return
    onClose()
    const docCtx = useDocContext && documentContent ? documentContent : undefined
    void start(task.trim(), targetDir, fileName, iterations, docCtx)
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-xl overflow-hidden shadow-2xl border flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-2">
            <Zap size={18} style={{ color: 'var(--color-warning)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('horseMode.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('horseMode.description')}
          </p>

          {/* Document context toggle */}
          {hasDocument && (
            <label
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
              style={{
                borderColor: useDocContext ? 'var(--accent-color)' : 'var(--border-color)',
                backgroundColor: useDocContext ? 'var(--color-info-bg)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={useDocContext}
                onChange={(e) => setUseDocContext(e.target.checked)}
                className="mt-0.5 accent-[var(--accent-color)]"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('horseMode.useDocContext')}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <FileText size={11} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {currentFileName}
                  </span>
                </div>
              </div>
            </label>
          )}

          {/* Task */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('horseMode.taskLabel')}
            </label>
            <textarea
              ref={textareaRef}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder={
                useDocContext
                  ? t('horseMode.taskPlaceholderWithDoc')
                  : t('horseMode.taskPlaceholder')
              }
              rows={4}
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleStart()
                }
              }}
            />
          </div>

          {/* Target directory */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('horseMode.directoryLabel')}
            </label>
            <div className="flex gap-2">
              <div
                className="flex-1 text-xs px-3 py-1.5 rounded-lg border truncate flex items-center"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                  color: targetDir ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {targetDir || t('horseMode.noDirectory')}
              </div>
              <button
                onClick={handleSelectDir}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              >
                <FolderOpen size={13} />
                {t('horseMode.browse')}
              </button>
            </div>
          </div>

          {/* Filename */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('horseMode.fileNameLabel')}
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => { setFileName(e.target.value); setFileNameManual(true) }}
              className="w-full text-sm px-3 py-1.5 rounded-lg border outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Iterations */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('horseMode.iterationsLabel', 'Refinement iterations')}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                className="flex-1 accent-[var(--accent-color)]"
              />
              <span
                className="text-xs tabular-nums font-medium min-w-[2ch] text-center"
                style={{ color: 'var(--text-primary)' }}
              >
                {iterations}
              </span>
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {iterations === 1
                ? t('horseMode.iterationsHintSingle', 'Single pass — no refinement.')
                : t('horseMode.iterationsHint', 'Each iteration refines the previous output with fresh context.')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {t('horseMode.hint')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('horseMode.cancel')}
            </button>
            <button
              onClick={handleStart}
              disabled={!task.trim() || !targetDir || !fileName}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
            >
              <Zap size={13} />
              {t('horseMode.start')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
