import { useEffect, useState } from 'react'

/**
 * Viewport breakpoint used by AppShell to collapse sidebars when the window
 * is too narrow to comfortably host all three panels.
 *
 *   wide    (>= 1100px)   default — left + right + agent can coexist pinned
 *   narrow  (900–1099px)  pinning is ignored; sidebars slide over content
 *   compact (< 900px)     sidebars open as full-width overlays with backdrop
 *
 * Implemented as a JS hook rather than CSS media queries because the layout
 * logic (marginLeft/marginRight, backdrop rendering, absolute vs static
 * positioning) is driven from React, not CSS.
 */
export type WindowBreakpoint = 'wide' | 'narrow' | 'compact'

const NARROW_MAX = 1100
const COMPACT_MAX = 900

function classify(width: number): WindowBreakpoint {
  if (width < COMPACT_MAX) return 'compact'
  if (width < NARROW_MAX) return 'narrow'
  return 'wide'
}

export function useWindowBreakpoint(): WindowBreakpoint {
  const [bp, setBp] = useState<WindowBreakpoint>(() =>
    typeof window === 'undefined' ? 'wide' : classify(window.innerWidth),
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setBp(classify(window.innerWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return bp
}
