import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import { useWorkspaceStore } from '../../store/workspaceStore'

/**
 * PageHeader — the Notion-style page title block: an optional emoji icon
 * and a large, inline-editable title. Sits above the document body and is
 * the canonical place to rename a page or set its icon.
 */

const QUICK_EMOJIS = [
  '📄', '📝', '📌', '✅', '💡', '🔥', '⭐', '🚀', '📚', '🗂️',
  '🧠', '🎯', '📅', '🛠️', '🐎', '🎨', '🔬', '💬', '📊', '🌱',
  '❤️', '⚡', '🧩', '🏷️',
]

export function PageHeader() {
  const pageId = useWorkspaceStore((s) => s.currentPageId)
  const title = useWorkspaceStore((s) => s.currentTitle)
  const content = useWorkspaceStore((s) => s.currentContent)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const renamePage = useWorkspaceStore((s) => s.renamePage)
  const setIcon = useWorkspaceStore((s) => s.setIcon)

  // The page's current icon comes from the tree; look it up from the active tab's page.
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const icon = useWorkspaceStore((s) => s.pageTree.flatMap(flattenIcons).find((p) => p.id === pageId)?.icon ?? null)

  const [draft, setDraft] = useState(title ?? '')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)

  // Sync local draft when the active page changes.
  useEffect(() => {
    setDraft(title ?? '')
  }, [pageId, title])

  // Fresh "Untitled" empty page → focus the title so the user can name it
  // immediately, the way pressing "New page" works in Notion.
  useEffect(() => {
    if (pageId && title === 'Untitled' && !content?.trim()) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    // Only run when the active page changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  // Auto-size the title textarea to its content.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // Close the emoji popover on outside click.
  useEffect(() => {
    if (!emojiOpen) return
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [emojiOpen])

  if (!pageId) return null

  const commit = () => {
    const next = draft.trim()
    if (next && next !== title) void renamePage(pageId, next)
    else if (!next) setDraft(title ?? '')
  }

  return (
    <div className="px-[max(1.5rem,calc((100%-720px)/2))] pt-8 pb-1">
      {/* Icon */}
      <div className="relative mb-1" ref={emojiRef}>
        {icon ? (
          <button
            onClick={() => setEmojiOpen((v) => !v)}
            className="text-5xl leading-none hover:bg-black/5 dark:hover:bg-white/5 rounded-lg p-1 -ml-1 transition-colors"
            title="Change icon"
          >
            {icon}
          </button>
        ) : (
          <button
            onClick={() => setEmojiOpen((v) => !v)}
            className="group inline-flex items-center gap-1 text-xs px-1.5 py-1 rounded-md opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
            title="Add icon"
          >
            <Smile size={14} />
            <span>Add icon</span>
          </button>
        )}

        {emojiOpen && (
          <div
            className="absolute z-30 mt-1 p-2 rounded-lg border shadow-lg w-56"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
          >
            <div className="grid grid-cols-8 gap-0.5">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { void setIcon(pageId, e); setEmojiOpen(false) }}
                  className="text-lg rounded hover:bg-black/10 dark:hover:bg-white/10 p-0.5"
                >
                  {e}
                </button>
              ))}
            </div>
            {icon && (
              <button
                onClick={() => { void setIcon(pageId, null); setEmojiOpen(false) }}
                className="mt-1.5 w-full text-[11px] py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); inputRef.current?.blur() }
        }}
        rows={1}
        placeholder="Untitled"
        spellCheck={false}
        className="w-full bg-transparent outline-none resize-none leading-tight"
        style={{
          color: 'var(--text-primary)',
          fontSize: '41px',
          lineHeight: 1.12,
          fontWeight: 500,
          letterSpacing: '-0.012em',
          fontFamily: 'var(--font-display, inherit)',
        }}
      />
    </div>
  )
}

function flattenIcons(node: { id: string; icon: string | null; children: any[] }): { id: string; icon: string | null }[] {
  return [{ id: node.id, icon: node.icon }, ...node.children.flatMap(flattenIcons)]
}
