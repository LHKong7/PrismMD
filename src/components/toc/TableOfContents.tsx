import { useState, useEffect } from 'react'
import type { TocEntry } from '../../lib/markdown/remarkToc'
import { TocItem } from './TocItem'

interface TableOfContentsProps {
  entries: TocEntry[]
}

export function TableOfContents({ entries }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter(Boolean) as HTMLElement[]

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (observerEntries) => {
        // Find the first visible heading
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
  }, [entries])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveId(id)
    }
  }

  return (
    <nav className="px-2">
      {entries.map((entry, i) => (
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
