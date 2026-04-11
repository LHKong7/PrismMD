import { useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { FileText, Sun, Moon, Monitor } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setTheme = useUIStore((s) => s.setTheme)
  const openFile = useFileStore((s) => s.openFile)
  const recentFiles = useFileStore((s) => s.recentFiles)
  const fileTree = useFileStore((s) => s.fileTree)
  const [search, setSearch] = useState('')

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  // Flatten file tree to get all files
  const flattenFiles = (nodes: typeof fileTree): string[] => {
    if (!nodes) return []
    const files: string[] = []
    for (const node of nodes) {
      if (node.type === 'file') {
        files.push(node.path)
      } else if (node.children) {
        files.push(...flattenFiles(node.children))
      }
    }
    return files
  }

  const allFiles = flattenFiles(fileTree)
  const fileName = (path: string) => path.split(/[/\\]/).pop() ?? path

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg rounded-xl overflow-hidden shadow-2xl border"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          value={search}
          onValueChange={setSearch}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          <Command.Input
            placeholder="Search files or commands..."
            className="w-full px-4 py-3 text-sm outline-none border-b bg-transparent"
            style={{
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          <Command.List className="max-h-72 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No results found.
            </Command.Empty>

            {/* Recent files */}
            {recentFiles.length > 0 && (
              <Command.Group heading="Recent Files" style={{ color: 'var(--text-muted)' }}>
                {recentFiles.map((filePath) => (
                  <Command.Item
                    key={filePath}
                    value={fileName(filePath)}
                    onSelect={() => {
                      openFile(filePath)
                      setOpen(false)
                    }}
                    className="flex items-center gap-2 px-3 py-2 mx-2 rounded text-sm cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="truncate">{fileName(filePath)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* All files */}
            {allFiles.length > 0 && (
              <Command.Group heading="Files" style={{ color: 'var(--text-muted)' }}>
                {allFiles.map((filePath) => (
                  <Command.Item
                    key={filePath}
                    value={fileName(filePath)}
                    onSelect={() => {
                      openFile(filePath)
                      setOpen(false)
                    }}
                    className="flex items-center gap-2 px-3 py-2 mx-2 rounded text-sm cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="truncate">{fileName(filePath)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Commands */}
            <Command.Group heading="Commands" style={{ color: 'var(--text-muted)' }}>
              <Command.Item
                value="Light theme"
                onSelect={() => { setTheme('light'); setOpen(false) }}
                className="flex items-center gap-2 px-3 py-2 mx-2 rounded text-sm cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Sun size={14} />
                <span>Switch to Light Theme</span>
              </Command.Item>
              <Command.Item
                value="Dark theme"
                onSelect={() => { setTheme('dark'); setOpen(false) }}
                className="flex items-center gap-2 px-3 py-2 mx-2 rounded text-sm cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Moon size={14} />
                <span>Switch to Dark Theme</span>
              </Command.Item>
              <Command.Item
                value="System theme"
                onSelect={() => { setTheme('system'); setOpen(false) }}
                className="flex items-center gap-2 px-3 py-2 mx-2 rounded text-sm cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Monitor size={14} />
                <span>Use System Theme</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
