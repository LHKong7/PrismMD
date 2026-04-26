import { Pin, PinOff, List, User, Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { useUIStore, type RightSidebarTab } from '../../store/uiStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useWindowBreakpoint } from '../../lib/hooks/useWindowBreakpoint'
import { useSidebarPanelRegistry } from '../../store/sidebarPanelRegistry'
import { TableOfContents } from '../toc/TableOfContents'
import { EntityPanel } from '../graph/EntityPanel'
import { RelatedRail } from '../graph/RelatedRail'
import type { TocEntry } from '../../lib/markdown/remarkToc'

interface RightSidebarProps {
  toc?: TocEntry[]
}

/**
 * Tabbed right-side panel.
 *
 *   - **TOC**      — always available (legacy content).
 *   - **Entity**   — only surfaced when the Knowledge Graph feature is on;
 *                    defaults to the focused entity from `uiStore`.
 *   - **Related**  — placeholder tab; its real body lands in B4. We show
 *                    the trigger here so layout and wiring match B3→B4
 *                    without another pass over AppShell.
 */
export function RightSidebar({ toc }: RightSidebarProps) {
  const { t } = useTranslation()
  const rightSidebarPinned = useUIStore((s) => s.rightSidebarPinned)
  const pinRightSidebar = useUIStore((s) => s.pinRightSidebar)
  const activeTab = useUIStore((s) => s.rightSidebarTab)
  const setTab = useUIStore((s) => s.setRightSidebarTab)
  const graphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const pluginPanels = useSidebarPanelRegistry((s) => s.panels)
  const canPin = useWindowBreakpoint() === 'wide'

  const tabs: {
    id: RightSidebarTab
    icon: React.ComponentType<{ size?: number }>
    label: string
    hidden?: boolean
  }[] = [
    { id: 'toc', icon: List, label: t('sidebar.contents') },
    { id: 'entity', icon: User, label: t('sidebar.entity'), hidden: !graphEnabled },
    { id: 'related', icon: Network, label: t('sidebar.related'), hidden: !graphEnabled },
    // Plugin-contributed tabs appear after the built-ins. Plugins can
    // register multiple; we dedupe by id already in the registry.
    ...pluginPanels.map((p) => ({
      id: p.id,
      icon: p.icon,
      label: p.title,
    })),
  ]

  // Resolve the active plugin panel (if any) so we render its component
  // body. Built-in tabs keep their explicit conditional rendering below.
  const activePluginPanel = pluginPanels.find((p) => p.id === activeTab) ?? null

  return (
    <div
      className="h-full flex flex-col border-l"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      <div
        className="flex items-center justify-between pl-2 pr-1 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {tabs
            .filter((tab) => !tab.hidden)
            .map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={clsx(
                  'flex items-center gap-1 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors border-b-2',
                  activeTab === id ? 'border-[var(--accent-color)]' : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5',
                )}
                style={{
                  color: activeTab === id ? 'var(--accent-color)' : 'var(--text-muted)',
                }}
                title={label}
              >
                <Icon size={12} />
                <span className="hidden xl:inline">{label}</span>
              </button>
            ))}
        </div>
        {canPin && (
          <button
            onClick={pinRightSidebar}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex-shrink-0"
            title={rightSidebarPinned ? t('sidebar.unpinSidebar') : t('sidebar.pinSidebar')}
          >
            {rightSidebarPinned ? (
              <PinOff size={14} style={{ color: 'var(--accent-color)' }} />
            ) : (
              <Pin size={14} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'toc' &&
          (toc && toc.length > 0 ? (
            <div className="h-full overflow-y-auto py-2">
              <TableOfContents entries={toc} />
            </div>
          ) : (
            <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {t('sidebar.noHeadings')}
            </p>
          ))}
        {activeTab === 'entity' && graphEnabled && (
          <div className="h-full overflow-y-auto">
            <EntityPanel />
          </div>
        )}
        {activeTab === 'related' && graphEnabled && <RelatedRail />}
        {activePluginPanel && (
          <div className="h-full overflow-y-auto">
            <activePluginPanel.component />
          </div>
        )}
      </div>
    </div>
  )
}
