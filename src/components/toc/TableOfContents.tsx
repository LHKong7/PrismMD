import { useState, useEffect } from 'react'
import type { TocEntry } from '../../lib/markdown/remarkToc'
import { useEditorStore } from '../../store/editorStore'
import { TocItem } from './TocItem'

interface TableOfContentsProps {
  entries: TocEntry[]
}

export function TableOfContents({ entries }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('')
  const editing = useEditorStore((s) => s.editing)
  const editorToc = useEditorStore((s) => s.editorToc)
  const scrollToLine = useEditorStore((s) => s.scrollToLine)

  // The entries to display: editor headings when editing, prop entries when reading
  const displayEntries = editing ? editorToc : entries

  // IntersectionObserver for reader mode only
  useEffect(() => {
    if (editing) return

    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter(Boolean) as HTMLElement[]

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const entry of observerEntries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      {
        rootMargin: '-60px 0px -80% 0px',
        threshold: 0,
      }
    )

    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [entries, editing])

  const handleClick = (id: string) => {
    if (editing) {
      // Find the EditorTocEntry with this id and scroll to its line
      const entry = editorToc.find((e) => e.id === id)
      if (entry) {
        scrollToLine(entry.line)
        setActiveId(id)
      }
    } else {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActiveId(id)
      }
    }
  }

  return (
    <nav className="px-2">
      {displayEntries.map((entry, i) => (
        <TocItem
          key={`${entry.id}-${i}`}
          entry={entry}
          isActive={entry.id === activeId}
          onClick={handleClick}
        />
      ))}
    </nav>
  )
}
