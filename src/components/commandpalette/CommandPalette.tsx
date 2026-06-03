import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { FilePlus, Sun, Moon, Monitor, Settings, Bot, Shield, Eye, Network, BookOpen, Puzzle, Search, Maximize2, Columns2, Rows2, X, Keyboard, FileStack, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAgentStore } from '../../store/agentStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useCommandRegistry } from '../../store/commandRegistry'
import { useTemplateStore } from '../../store/templateStore'
import { applyTheme, getThemeById } from '../../lib/theme/themes'

interface CommandPaletteProps {
  onOpenSettings: () => void
  onOpenHorseMode?: () => void
}

export function CommandPalette({ onOpenSettings, onOpenHorseMode }: CommandPaletteProps) {
  const { t } = useTranslation()
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const privacyMode = useSettingsStore((s) => s.privacyMode)
  const setPrivacyMode = useSettingsStore((s) => s.setPrivacyMode)
  const focusMode = useSettingsStore((s) => s.focusMode)
  const setFocusMode = useSettingsStore((s) => s.setFocusMode)
  const createPage = useWorkspaceStore((s) => s.createPage)
  const openPage = useWorkspaceStore((s) => s.openPage)
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const toggleAgentSidebar = useAgentStore((s) => s.toggleAgentSidebar)
  const insightGraphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const ingestFile = useInsightGraphStore((s) => s.ingestFile)
  const mainViewMode = useUIStore((s) => s.mainViewMode)
  const toggleMainViewMode = useUIStore((s) => s.toggleMainViewMode)
  const pluginCommands = useCommandRegistry((s) => s.commands)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [pageHits, setPageHits] = useState<Array<{ id: string; title: string }>>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)

  // Debounce keystrokes before querying the workspace search.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 150)
    return () => window.clearTimeout(id)
  }, [search])

  useEffect(() => {
    let cancelled = false
    if (debouncedSearch.trim().length < 2) {
      setPageHits([])
      return
    }
    window.electronAPI.workspaceSearch(debouncedSearch.trim())
      .then((res) => { if (!cancelled) setPageHits(res.map((r) => ({ id: r.id, title: r.title }))) })
      .catch(() => { if (!cancelled) setPageHits([]) })
    return () => { cancelled = true }
  }, [debouncedSearch])

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

  if (!open) return null

  const cls = "flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-sm cursor-pointer aria-selected:bg-[var(--accent-soft,rgba(0,0,0,0.06))] aria-selected:text-[var(--text-primary)]"

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] prism-fade-in" onClick={() => setOpen(false)}>
      <div
        className="absolute inset-0 backdrop-blur-[3px]"
        style={{ backgroundColor: 'color-mix(in srgb, var(--text-primary) 28%, transparent)' }}
      />
      <div
        ref={dialogRef}
        className="relative w-full max-w-xl rounded-2xl overflow-hidden border prism-fade-scale-in"
        style={{ backgroundColor: 'var(--bg-secondary, var(--bg-primary))', borderColor: 'var(--border-color)', boxShadow: 'var(--shadow-lg, 0 24px 64px -18px rgba(0,0,0,.4))', fontFamily: 'var(--font-ui)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.placeholder')}
        tabIndex={-1}
      >
        <Command value={search} onValueChange={setSearch}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
          style={{ color: 'var(--text-primary)' }}>
          <div className="flex items-center gap-3 px-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <Command.Input
              placeholder={t('commandPalette.placeholder')}
              className="flex-1 py-3.5 text-base outline-none bg-transparent"
              style={{ color: 'var(--text-primary)' }}
            />
            <span
              className="text-[10px] px-1.5 py-0.5 rounded border font-mono"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              esc
            </span>
          </div>
          <Command.List className="max-h-72 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('commandPalette.noResults')}
            </Command.Empty>

            {pageHits.length > 0 && (
              <Command.Group heading={t('commandPalette.searchResults')} style={{ color: 'var(--text-muted)' }}>
                {pageHits.map((hit) => (
                  <Command.Item
                    key={`hit:${hit.id}`}
                    value={`${search} ${hit.title}`}
                    onSelect={() => { void openPage(hit.id); setOpen(false) }}
                    className={cls}
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Search size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="truncate">{hit.title || 'Untitled'}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading={t('commandPalette.commands')} style={{ color: 'var(--text-muted)' }}>
              <Command.Item value="New Page" onSelect={() => { void createPage('Untitled', null); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                <FilePlus size={14} /><span>{t('sidebar.newPage', 'New page')}</span>
              </Command.Item>
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
              {onOpenHorseMode && (
                <Command.Item value="Horse Mode" onSelect={() => { onOpenHorseMode(); setOpen(false) }} className={cls} style={{ color: 'var(--text-secondary)' }}>
                  <Zap size={14} /><span>{t('commandPalette.horseMode', 'Horse Mode')}</span>
                </Command.Item>
              )}
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
              {insightGraphEnabled && currentPageId && (
                <Command.Item
                  value="Save Document to Knowledge Graph"
                  onSelect={() => { void ingestFile(currentPageId); setOpen(false) }}
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

            {/* Templates → create a new page from the template */}
            <Command.Group heading={t('commandPalette.templates', 'Templates')} style={{ color: 'var(--text-muted)' }}>
              {useTemplateStore.getState().templates.map((tpl) => (
                <Command.Item
                  key={`tpl-${tpl.id}`}
                  value={`template ${tpl.name}`}
                  onSelect={() => {
                    setOpen(false)
                    const content = tpl.content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
                    const editor = require('../../store/editorStore').useEditorStore.getState()
                    if (editor.editing && editor.editorViewRef) {
                      const view = editor.editorViewRef
                      const pos = view.state.selection.main.head
                      view.dispatch({ changes: { from: pos, insert: content } })
                    } else {
                      void (async () => {
                        const ws = useWorkspaceStore.getState()
                        const id = await ws.createPage(tpl.name, null)
                        if (id) {
                          await ws.savePage(id, content)
                          await ws.loadTree()
                          await ws.openPage(id)
                        }
                      })()
                    }
                  }}
                  className={cls}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <FileStack size={14} />
                  <span className="truncate">{tpl.name}</span>
                  <span className="ml-auto text-[10px] opacity-50">{t('commandPalette.template', 'Template')}</span>
                </Command.Item>
              ))}
            </Command.Group>

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
