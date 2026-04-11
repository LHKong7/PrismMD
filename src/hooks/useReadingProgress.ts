import { useEffect, type RefObject } from 'react'

export function useReadingProgress(scrollRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const { scrollTop, scrollHeight, clientHeight } = el
          const maxScroll = scrollHeight - clientHeight
          const progress = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0
          const bar = document.getElementById('reading-progress-bar')
          if (bar) {
            bar.style.width = `${Math.min(100, progress)}%`
          }
          ticking = false
        })
        ticking = true
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [scrollRef])
}
