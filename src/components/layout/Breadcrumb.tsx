import { useMemo } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { useToastStore } from '../../store/toastStore'
import { usePaneFileData } from '../../hooks/usePaneFileData'

export function Breadcrumb() {
  const { filePath: currentFilePath } = usePaneFileData()
  const openFolders = useFileStore((s) => s.openFolders)
  const setAutoExpandPath = useFileStore((s) => s.setAutoExpandPath)

  const segments = useMemo(() => {
    if (!currentFilePath) return null

    // Find the owning open folder to compute a relative path.
    const root = openFolders.find(
      (f) =>
        currentFilePath === f.path ||
        currentFilePath.startsWith(f.path + '/') ||
        currentFilePath.startsWith(f.path + '\\'),
    )

    if (!root) {
      // No owning folder — just show the file name.
      const name = currentFilePath.split(/[/\\]/).pop() ?? currentFilePath
      return [{ label: name, path: currentFilePath, isFile: true }]
    }

    const relative = currentFilePath.slice(root.path.length + 1)
    const parts = relative.split(/[/\\]/)
    const result: { label: string; path: string; isFile: boolean }[] = [
      { label: root.name, path: root.path, isFile: false },
    ]
    let accumulated = root.path
    for (let i = 0; i < parts.length; i++) {
      accumulated += '/' + parts[i]
      result.push({
        label: parts[i],
        path: accumulated,
        isFile: i === parts.length - 1,
      })
    }
    return result
  }, [currentFilePath, openFolders])

  if (!segments || !currentFilePath) return null

  return (
    <div
      className="flex items-center gap-0.5 px-3 text-xs shrink-0 overflow-hidden"
      style={{
        height: 24,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {segments.map((seg, i) => (
        <span key={seg.path} className="flex items-center gap-0.5 min-w-0">
          {i > 0 && <ChevronRight size={10} className="shrink-0 opacity-50" />}
          {seg.isFile ? (
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
              {seg.label}
            </span>
          ) : (
            <button
              onClick={() => setAutoExpandPath(seg.path)}
              className="truncate hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              {seg.label}
            </button>
          )}
        </span>
      ))}

      <button
        onClick={() => {
          navigator.clipboard.writeText(currentFilePath)
          useToastStore.getState().show('success', 'Path copied')
        }}
        className="ml-auto shrink-0 p-0.5 rounded opacity-0 hover:opacity-100 group-hover:opacity-50 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
        title="Copy path"
        aria-label="Copy file path"
      >
        <Copy size={11} />
      </button>
    </div>
  )
}
