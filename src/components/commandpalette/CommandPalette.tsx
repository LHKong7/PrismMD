import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { FileText, FilePlus, FolderPlus, Pencil, Trash2, Copy, ExternalLink, Sun, Moon, Monitor, Settings, Bot, Shield, Eye, Network, BookOpen, Puzzle, Search, Maximize2, Columns2, Rows2, X, Keyboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAgentStore } from '../../store/agentStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useCommandRegistry } from '../../store/commandRegistry'
import { useSearchIndexStore } from '../../store/searchIndexStore'
import { applyTheme, getThemeById } from '../../lib/theme/themes'
import { flattenFiles, fileName } from '../../lib/fileTree'

interface CommandPaletteProps {
  onOpenSettings: () => void
}

export function CommandPalette({ onOpenSettings }: CommandPaletteProps) {
  const { t } = useTranslation()
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const privacyMode = useSettingsStore((s) => s.privacyMode)
  const setPrivacyMode = useSettingsStore((s) => s.setPrivacyMode)
  const focusMode = useSettingsStore((s) => s.focusMode)
  const setFocusMode = useSettingsStore((s) => s.setFocusMode)
  const openFile = useFileStore((s) => s.openFile)
  const createNewFile = useFileStore((s) => s.createNewFile)
  const createFolder = useFileStore((s) => s.createFolder)
  const setRenamingPath = useFileStore((s) => s.setRenamingPath)
  const setPendingDelete = useFileStore((s) => s.setPendingDelete)
  const duplicateFileFn = useFileStore((s) => s.duplicateFile)
  const showInFolder = useFileStore((s) => s.showInFolder)
  const recentFiles = useFileStore((s) => s.recentFiles)
  const openFolders = useFileStore((s) => s.openFolders)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const toggleAgentSidebar = useAgentStore((s) => s.toggleAgentSidebar)
  const insightGraphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const ingestFile = useInsightGraphStore((s) => s.ingestFile)
  const mainViewMode = useUIStore((s) => s.mainViewMode)
  const toggleMainViewMode = useUIStore((s) => s.toggleMainViewMode)
  const pluginCommands = useCommandRegistry((s) => s.commands)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)

  const buildIndex = useSearchIndexStore((s) => s.build)
  const indexStatus = useSearchIndexStore((s) => s.status)
  const indexedCount = useSearchIndexStore((s) => s.fileCount)
  const runSearch = useSearchIndexStore((s) => s.search)

  // Build the index lazily the first time the palette opens — the read
  // pass is async, so paying it on demand keeps app startup snappy.
  useEffect(() => {
    if (open && indexStatus === 'idle') void buildIndex()
  }, [open, indexStatus, buildIndex])

  // Debounce the user's keystrokes before running MiniSearch so we don't
  // re-rank on every character.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 150)
    return () => window.clearTimeout(id)
  }, [search])

  const searchHits = useMemo(() => {
    if (debouncedSearch.trim().length < 2) return []
    if (indexStatus !== 'ready') return []
    return runSearch(debouncedSearch)
  }, [debouncedSearch, indexStatus, runSearch])

  // Group plugin commands by their `group` field so they can each render
  // under their own heading. Core commands stay hard-coded below (their
  // behaviour is tightly coupled to local component closures).
  const pluginGroups = useMemo(() => {
    const map = new Map<string, typeof pluginCommands>()
    for (const cmd of pluginCommands) {
      const g = cmd.group ?? 'Plugins'
      const list = map.get(g)
      if (list) list.push(cmd)
      else map.set(g, [cmd])
    }
    return Array.from(map.entries())
  }, [pluginCommands])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); setOpen(!open) }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  const switchTheme = (id: string) => {
    setThemeId(id); setThemeMode('manual')
    const theme = getThemeById(id); if (theme) applyTheme(theme)
    setOpen(false)
  }

  const allFiles = openFolders.flatMap((f) => flattenFiles(f.tree))

  if (!open) return null

  const cls = "flex items-center gap-2 px-3 py-2 mx-2 rounded text-sm cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/5"

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-xl overflow-hidden shadow-2xl border"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.placeholder')}
        tabIndex={-1}
      >
        <Command value={search} onValueChange={setSearch}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
          style={{ color: 'var(--text-primary)' }}>
          <Command.Input
            placeholder={t('commandPalette.placeholder')}
            className="w-full px-4 py-3 text-sm outline-none border-b bg-transparent"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
          <Command.List className="max-h-72 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('commandPalette.noResults')}
            </Command.Empty>

            {debouncedSearch.trim().length >= 2 && (
              <Command.Group heading={t('commandPalette.searchResults')} style={{ color: 'var(--text-muted)' }}>
                {indexStatus === 'building' && (
                  <div className="px-3 py-2 text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <Search size={12} />
                    <span>{t('commandPalette.indexing', { count: indexedCount })}</span>
                  </div>
                )}
                {indexStatus === 'ready' && searchHits.length === 0 && (
                  <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('commandPalette.noContentMatch')}
                  </div>
                )}
                {searchHits.map((hit) => (
                  <Command.Item
                    key={`hit:${hit.path}`}
                    value={`${search} ${hit.path}`}
                    onSelect={() => { openFile(hit.path); setOpen(false) }}
                    className={cls}
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Search size={14} style={{ color: 'var(--text-muted)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{hit.name}</div>
                      {hit.snippet && (
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {hit.snippet}
                        </div>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {recentFiles.length > 0 && (
              <Command.Group heading={t('commandPalette.recentFiles')} style={{ color: 'var(--text-muted)' }}>
                {recentFiles.map((fp) => (
                  <Command.Item key={fp} value={fileName(fp)} onSelect={() => { openFile(fp); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                    <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="truncate">{fileName(fp)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {allFiles.length > 0 && (
              <Command.Group heading={t('commandPalette.files')} style={{ color: 'var(--text-muted)' }}>
                {allFiles.map((fp) => (
                  <Command.Item key={fp} value={fileName(fp)} onSelect={() => { openFile(fp); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                    <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="truncate">{fileName(fp)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading={t('commandPalette.commands')} style={{ color: 'var(--text-muted)' }}>
              <Command.Item value="New File" onSelect={() => { createNewFile(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <FilePlus size={14} /><span>{t('commandPalette.newFile')}</span>
              </Command.Item>
              {openFolders.length > 0 && (
                <Command.Item value="New Folder" onSelect={() => { createFolder(openFolders[0].path); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                  <FolderPlus size={14} /><span>{t('commandPalette.newFolder')}</span>
                </Command.Item>
              )}
              {currentFilePath && (
                <Command.Item value="Rename File" onSelect={() => { setRenamingPath(currentFilePath); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                  <Pencil size={14} /><span>{t('commandPalette.renameFile')}</span>
                </Command.Item>
              )}
              {currentFilePath && (
                <Command.Item value="Duplicate File" onSelect={() => { void duplicateFileFn(currentFilePath); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                  <Copy size={14} /><span>{t('commandPalette.duplicateFile')}</span>
                </Command.Item>
              )}
              {currentFilePath && (
                <Command.Item value="Delete File" onSelect={() => { setPendingDelete({ path: currentFilePath, name: currentFilePath.split(/[/\\]/).pop() ?? '', isDirectory: false }); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 size={14} /><span>{t('commandPalette.deleteFile')}</span>
                </Command.Item>
              )}
              {currentFilePath && (
                <Command.Item value="Reveal in Finder" onSelect={() => { showInFolder(currentFilePath); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                  <ExternalLink size={14} /><span>{t('commandPalette.revealInFinder')}</span>
                </Command.Item>
              )}
              <Command.Item value="Light theme" onSelect={() => switchTheme('light')} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Sun size={14} /><span>{t('commandPalette.lightTheme')}</span>
              </Command.Item>
              <Command.Item value="Dark theme" onSelect={() => switchTheme('dark')} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Moon size={14} /><span>{t('commandPalette.darkTheme')}</span>
              </Command.Item>
              <Command.Item value="System theme" onSelect={() => { setThemeMode('system'); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Monitor size={14} /><span>{t('commandPalette.systemTheme')}</span>
              </Command.Item>
              <Command.Item value="Open Settings" onSelect={() => { onOpenSettings(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Settings size={14} /><span>{t('commandPalette.openSettings')}</span>
              </Command.Item>
              <Command.Item value="Keyboard Shortcuts" onSelect={() => { useUIStore.getState().openSettings('shortcuts'); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Keyboard size={14} /><span>{t('commandPalette.keyboardShortcuts')}</span>
              </Command.Item>
              <Command.Item value="Toggle AI" onSelect={() => { toggleAgentSidebar(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Bot size={14} /><span>{t('commandPalette.toggleAgent')}</span>
              </Command.Item>
              <Command.Item value="Toggle Privacy" onSelect={() => { setPrivacyMode(!privacyMode); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Shield size={14} /><span>{t('commandPalette.togglePrivacy')}</span>
              </Command.Item>
              <Command.Item value="Toggle Focus" onSelect={() => { setFocusMode(!focusMode); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Eye size={14} /><span>{t('commandPalette.toggleFocusMode')}</span>
              </Command.Item>
              <Command.Item value="Toggle Zen Mode" onSelect={() => { useUIStore.getState().toggleZenMode(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Maximize2 size={14} /><span>{t('commandPalette.toggleZenMode')}</span>
              </Command.Item>
              <Command.Item value="Split Right" onSelect={() => { const s = useUIStore.getState(); if (!s.splitLayout.split) s.splitPane('horizontal'); else if (s.splitLayout.direction !== 'horizontal') s.toggleSplitDirection(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Columns2 size={14} /><span>{t('split.horizontal')}</span>
              </Command.Item>
              <Command.Item value="Split Down" onSelect={() => { const s = useUIStore.getState(); if (!s.splitLayout.split) s.splitPane('vertical'); else if (s.splitLayout.direction !== 'vertical') s.toggleSplitDirection(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Rows2 size={14} /><span>{t('split.vertical')}</span>
              </Command.Item>
              {useUIStore.getState().splitLayout.split && (
                <Command.Item value="Close Split" onSelect={() => { useUIStore.getState().unsplit(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                  <X size={14} /><span>{t('split.unsplit')}</span>
                </Command.Item>
              )}
              {insightGraphEnabled && currentFilePath && (
                <Command.Item
                  value="Save Document to Knowledge Graph"
                  onSelect={() => { ingestFile(currentFilePath); setOpen(false) }}
                  className={cls}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Network size={14} /><span>{t('commandPalette.insightGraphIngest')}</span>
                </Command.Item>
              )}
              {insightGraphEnabled && (
                <Command.Item
                  value="Toggle Knowledge Graph View"
                  onSelect={() => { toggleMainViewMode(); setOpen(false) }}
                  className={cls}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {mainViewMode === 'graph' ? <BookOpen size={14} /> : <Network size={14} />}
                  <span>
                    {mainViewMode === 'graph'
                      ? t('commandPalette.showReader')
                      : t('commandPalette.showGraph')}
                  </span>
                </Command.Item>
              )}
            </Command.Group>

            {/* Plugin-contributed commands. Grouped by the `group` the
                plugin provided so multiple plugins sharing a group (e.g.
                "Export") render under one heading. */}
            {pluginGroups.map(([group, items]) => (
              <Command.Group key={group} heading={group} style={{ color: 'var(--text-muted)' }}>
                {items.map((cmd) => {
                  const Icon = cmd.icon ?? Puzzle
                  return (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.title}
                      onSelect={() => {
                        setOpen(false)
                        void useCommandRegistry.getState().execute(cmd.id)
                      }}
                      className={cls}
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Icon size={14} />
                      <span className="truncate">{cmd.title}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
