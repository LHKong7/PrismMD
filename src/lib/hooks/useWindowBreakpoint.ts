import { useEffect, useState } from 'react'

/**
 * Viewport breakpoint used by AppShell to collapse sidebars when the window
 * is too narrow to comfortably host all three panels.
 *
 *   wide    (>= 800px)    default — sidebars can be pinned to push content
 *   narrow  (600–799px)   pinning is ignored; sidebars slide over content
 *   compact (< 600px)     sidebars open as full-width overlays with backdrop
 *
 * Breakpoints were lowered from the original 1100/900 to better suit
 * typical laptop screens (1280–1440px) where pinning a sidebar should
 * still be possible.
 *
 * Implemented as a JS hook rather than CSS media queries because the layout
 * logic (marginLeft/marginRight, backdrop rendering, absolute vs static
 * positioning) is driven from React, not CSS.
 */
export type WindowBreakpoint = 'wide' | 'narrow' | 'compact'

const NARROW_MAX = 800
const COMPACT_MAX = 600

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
