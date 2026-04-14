import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { FileText, Sun, Moon, Monitor, Settings, Bot, Shield, Eye, Network, BookOpen, Puzzle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAgentStore } from '../../store/agentStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useCommandRegistry } from '../../store/commandRegistry'
import { applyTheme, getThemeById } from '../../lib/theme/themes'

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

  const flattenFiles = (nodes: import('../../types/electron').FileTreeNode[]): string[] => {
    const files: string[] = []
    for (const node of nodes) {
      if (node.type === 'file') files.push(node.path)
      else if (node.children) files.push(...flattenFiles(node.children))
    }
    return files
  }

  const allFiles = openFolders.flatMap((f) => flattenFiles(f.tree))
  const fileName = (path: string) => path.split(/[/\\]/).pop() ?? path

  if (!open) return null

  const cls = "flex items-center gap-2 px-3 py-2 mx-2 rounded text-sm cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/5"

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-xl overflow-hidden shadow-2xl border"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
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
              <Command.Item value="Toggle AI" onSelect={() => { toggleAgentSidebar(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Bot size={14} /><span>{t('commandPalette.toggleAgent')}</span>
              </Command.Item>
              <Command.Item value="Toggle Privacy" onSelect={() => { setPrivacyMode(!privacyMode); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Shield size={14} /><span>{t('commandPalette.togglePrivacy')}</span>
              </Command.Item>
              <Command.Item value="Toggle Focus" onSelect={() => { setFocusMode(!focusMode); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <Eye size={14} /><span>{t('commandPalette.toggleFocusMode')}</span>
              </Command.Item>
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
