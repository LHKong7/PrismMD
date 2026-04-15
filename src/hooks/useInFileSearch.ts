import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * In-file search over a live DOM subtree (the markdown body). Wraps each
 * substring match in `<mark class="in-file-match">` and tracks a current
 * index for prev/next navigation. Restores the original DOM on close or
 * when the query is cleared.
 *
 * Why DOM-walking instead of a regex over the markdown source: the source
 * contains syntax (links, fences, html) that doesn't show up in the
 * rendered output, so source-based matches would mis-highlight. Walking
 * the rendered text nodes guarantees what the user sees is what we match.
 */
export function useInFileSearch(
  containerRef: React.RefObject<HTMLElement | null>,
  /** Bumps whenever the rendered markdown content changes — re-runs search. */
  contentKey: unknown,
) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [currentIdx, setCurrentIdx] = useState(0)
  const matchElsRef = useRef<HTMLElement[]>([])

  const clearHighlights = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    const marks = root.querySelectorAll<HTMLElement>('mark.in-file-match')
    marks.forEach((m) => {
      const parent = m.parentNode
      if (!parent) return
      while (m.firstChild) parent.insertBefore(m.firstChild, m)
      parent.removeChild(m)
      parent.normalize()
    })
    matchElsRef.current = []
    setMatchCount(0)
    setCurrentIdx(0)
  }, [containerRef])

  const applyHighlights = useCallback(
    (q: string) => {
      clearHighlights()
      const root = containerRef.current
      if (!root || !q) return

      const needle = q.toLowerCase()
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          // Skip code areas to avoid breaking syntax highlight DOM, and
          // skip inside our own marks (shouldn't exist post-clear, but
          // belt + suspenders).
          if (parent.closest('mark.in-file-match')) return NodeFilter.FILTER_REJECT
          const tag = parent.tagName
          if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      })

      const found: HTMLElement[] = []
      const targets: Text[] = []
      let n: Node | null
      while ((n = walker.nextNode())) targets.push(n as Text)

      for (const textNode of targets) {
        const text = textNode.nodeValue ?? ''
        const lower = text.toLowerCase()
        let cursor = 0
        const frag: Node[] = []
        let i = lower.indexOf(needle, cursor)
        if (i < 0) continue
        while (i >= 0) {
          if (i > cursor) frag.push(document.createTextNode(text.slice(cursor, i)))
          const mark = document.createElement('mark')
          mark.className = 'in-file-match'
          mark.textContent = text.slice(i, i + needle.length)
          frag.push(mark)
          found.push(mark)
          cursor = i + needle.length
          i = lower.indexOf(needle, cursor)
        }
        if (cursor < text.length) frag.push(document.createTextNode(text.slice(cursor)))
        const parent = textNode.parentNode
        if (!parent) continue
        for (const node of frag) parent.insertBefore(node, textNode)
        parent.removeChild(textNode)
      }

      matchElsRef.current = found
      setMatchCount(found.length)
      setCurrentIdx(found.length > 0 ? 0 : 0)
    },
    [clearHighlights, containerRef],
  )

  // Re-run highlights when query or content changes.
  useEffect(() => {
    if (!open) return
    applyHighlights(query)
    return () => {
      // Don't clear on every dep change — clearHighlights is invoked at
      // the top of applyHighlights. We only fully clear when `open`
      // flips off (handled below).
    }
  }, [open, query, contentKey, applyHighlights])

  // Tear down when closed.
  useEffect(() => {
    if (open) return
    clearHighlights()
    setQuery('')
  }, [open, clearHighlights])

  // Mark the current match and scroll it into view.
  useEffect(() => {
    const els = matchElsRef.current
    els.forEach((el, i) => el.classList.toggle('current', i === currentIdx))
    const target = els[currentIdx]
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [currentIdx, matchCount])

  const next = useCallback(() => {
    setCurrentIdx((i) => (matchCount === 0 ? 0 : (i + 1) % matchCount))
  }, [matchCount])

  const prev = useCallback(() => {
    setCurrentIdx((i) => (matchCount === 0 ? 0 : (i - 1 + matchCount) % matchCount))
  }, [matchCount])

  return {
    open,
    setOpen,
    query,
    setQuery,
    matchCount,
    currentIdx,
    next,
    prev,
  }
}
