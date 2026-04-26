import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/uiStore'
import { DocumentReader } from '../reader/DocumentReader'
import { ErrorBoundary } from '../ErrorBoundary'

/**
 * Zen Mode — a fullscreen, distraction-free document overlay.
 *
 * When active it covers the entire viewport with a clean background,
 * centers the document at a comfortable reading width, and hides all
 * chrome (sidebars, title bar, status bar, tabs). The user can exit
 * with Escape or a small close button that auto-hides after 1.5s of
 * mouse inactivity.
 */
export function ZenMode() {
  const { t } = useTranslation()
  const zenMode = useUIStore((s) => s.zenMode)
  const setZenMode = useUIStore((s) => s.setZenMode)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-hide the exit button after 1.5s of no mouse movement.
  useEffect(() => {
    if (!zenMode) return

    const scheduleHide = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setShowControls(true)
      hideTimer.current = setTimeout(() => setShowControls(false), 1500)
    }

    scheduleHide()
    window.addEventListener('mousemove', scheduleHide)
    return () => {
      window.removeEventListener('mousemove', scheduleHide)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [zenMode])

  // Escape key exits zen mode.
  useEffect(() => {
    if (!zenMode) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setZenMode(false)
      }
    }
    // Use capture so we intercept before other Escape handlers.
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [zenMode, setZenMode])

  if (!zenMode) return null

  return (
    <div
      className="fixed inset-0 flex flex-col items-center overflow-y-auto"
      style={{
        zIndex: 50, // z-modal
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Subtle vignette gradient at top and bottom */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-16"
        style={{
          background: 'linear-gradient(to bottom, var(--bg-primary), transparent)',
          zIndex: 51,
        }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 h-16"
        style={{
          background: 'linear-gradient(to top, var(--bg-primary), transparent)',
          zIndex: 51,
        }}
      />

      {/* Exit button — auto-hides */}
      <button
        onClick={() => setZenMode(false)}
        className="fixed top-4 right-4 p-2 rounded-lg transition-opacity duration-300"
        style={{
          zIndex: 52,
          opacity: showControls ? 0.6 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-color)',
        }}
        aria-label={t('zenMode.exit')}
        title={`${t('zenMode.exit')} (Esc)`}
      >
        <X size={16} />
      </button>

      {/* Centered content container */}
      <div className="w-full max-w-[720px] mx-auto px-6 py-16 flex-1">
        <ErrorBoundary>
          <DocumentReader />
        </ErrorBoundary>
      </div>
    </div>
  )
}
