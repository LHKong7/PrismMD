import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Check, Plus, Minus } from 'lucide-react'
import { themes, type ThemeDefinition } from '../../lib/theme/themes'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useSettingsStore } from '../../store/settingsStore'
import { useUIStore } from '../../store/uiStore'

/**
 * ThemeCompare — the "Prism — three identities" compare gallery.
 *
 * Faithful in-app realization of the `Prism - Compare` design, which is a
 * Figma-ish *design canvas*: a warm-gray grid surface you pan/zoom, with the
 * same workspace shown as scaled artboards in three reading identities, and a
 * fullscreen focus overlay (←/→/Esc) to open any frame large. We keep the
 * canvas chrome and interaction model from the design and add the one thing the
 * app needs that a static design can't: click "Use this identity" to apply it.
 *
 * Each artboard is theme-scoped by setting that identity's tokens as inline CSS
 * custom properties on its container + data-identity, so the identity-scoped
 * rules in markdown.css (serif prose, the Newsprint drop-cap/§ signature) and
 * every var(--token) resolve against the tile, not the app's active theme.
 */

// ── Canvas geometry (literal px; the whole world scales, like the design) ──
const W = 1440
const H = 900
const GAP = 64
const SIDEPAD = 80
const LABEL_H = 34
const TOPPAD = 64
const BOTTOMPAD = 80
const CONTENT_W = 3 * W + 2 * GAP + 2 * SIDEPAD
const CONTENT_H = TOPPAD + LABEL_H + H + BOTTOMPAD

const MIN_SCALE = 0.1
const MAX_SCALE = 8

// Figma-ish canvas chrome (fixed warm-gray, independent of the app theme).
const DC = {
  bg: '#f0eee9',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  accent: '#c96442',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
}

const GRID_SVG =
  "url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"120\"><path d=\"M120 0H0v120\" fill=\"none\" stroke=\"rgba(0,0,0,0.06)\" stroke-width=\"1\"/></svg>')"

const CANVAS_CSS = `
.pc-grid { background-image: ${GRID_SVG}; background-size: 120px 120px; }
.pc-slot .pc-btns { opacity: 0; transition: opacity .12s ease; }
.pc-slot:hover .pc-btns, .pc-slot:focus-within .pc-btns { opacity: 1; }
.pc-iconbtn:hover { background: rgba(0,0,0,.06); color: #2a251f; }
.pc-arrow:hover { background: rgba(255,255,255,.18) !important; }
.pc-zoombtn:hover { background: rgba(0,0,0,.06); }
.pc-slot button:focus-visible, .pc-iconbtn:focus-visible, .pc-zoombtn:focus-visible, .pc-arrow:focus-visible { outline: 2px solid ${DC.accent}; outline-offset: 2px; }
.pc-card * { scrollbar-width: none; }
.pc-card *::-webkit-scrollbar { display: none; }
`

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

const EXPAND_ICON = (
  <svg width={13} height={13} viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const PrismMark = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
    <path d="M50 14 L86 78 L14 78 Z" stroke="var(--ink, var(--text-primary))" strokeWidth={3} strokeLinejoin="round" />
    <path d="M50 14 L50 78" stroke="var(--accent-color)" strokeWidth={2} />
    <path d="M62 56 L90 44" stroke="var(--spectrum-1, var(--accent-color))" strokeWidth={2.5} />
    <path d="M62 60 L92 56" stroke="var(--spectrum-3, var(--accent-color))" strokeWidth={2.5} />
    <path d="M62 64 L90 68" stroke="var(--spectrum-4, var(--accent-color))" strokeWidth={2.5} />
  </svg>
)

/** The shared sample document. Top-level nodes are direct children of
 * `.markdown-body` so the Newsprint `> p:first-of-type::first-letter` drop cap
 * targets the lede. */
function SampleDoc() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('themeCompare.sample.title', 'On Reading by Warm Light')}</h1>
      <p>
        {t('themeCompare.sample.lede', 'Prism treats a document as an instrument, not a page. The same words can be tuned to the hour — bright copper at noon, an ember glow at midnight, or the crisp ink of the morning edition.')}
      </p>
      <h2>{t('themeCompare.sample.heading', 'Three tunings')}</h2>
      <p>
        {t('themeCompare.sample.body1', 'Each identity sets type, paper and accent together. Highlight a passage and the ')}
        <mark style={{ background: 'var(--hl-yellow, var(--highlight-yellow))', color: 'inherit', padding: '0 .12em', borderRadius: '2px' }}>
          {t('themeCompare.sample.marked', 'marker warms')}
        </mark>
        {t('themeCompare.sample.body2', ' to match, while inline ')}
        <code style={{ background: 'var(--code-bg)', color: 'var(--code-ink, var(--text-primary))', padding: '.08em .35em', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '.86em' }}>
          code
        </code>
        {t('themeCompare.sample.body3', ' keeps its own grain.')}
      </p>
      <blockquote style={{ margin: '1.1em 0', paddingLeft: '0.9em', borderLeft: '3px solid var(--accent-color)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        {t('themeCompare.sample.quote', 'Light is not a setting. It is part of how a sentence is read.')}
      </blockquote>
      <pre style={{ background: 'var(--code-bg)', color: 'var(--code-ink, var(--text-primary))', fontFamily: 'var(--font-mono)', fontSize: '.82rem', padding: '.7em .9em', borderRadius: '8px', border: '1px solid var(--line, var(--border-color))', overflow: 'hidden', margin: '0 0 1.1em' }}>
        <code style={{ padding: 0, background: 'none', color: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', display: 'block' }}>
          prism.tune(&quot;campfire&quot;)
        </code>
      </pre>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'var(--font-ui)', fontSize: '.92rem' }}>
        <li style={{ display: 'flex', alignItems: 'center', gap: '.5em', marginBottom: '.4em' }}>
          <input type="checkbox" checked readOnly style={{ accentColor: 'var(--accent-color)' }} />
          <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{t('themeCompare.sample.task1', 'Pick a tuning')}</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: '.5em' }}>
          <input type="checkbox" readOnly style={{ accentColor: 'var(--accent-color)' }} />
          <span>{t('themeCompare.sample.task2', 'Read until dusk')}</span>
        </li>
      </ul>
    </>
  )
}

/** A themed PrismMD workspace mock at literal W×H — titlebar + page rail +
 * reading column — so the three identities read as the same workspace retuned. */
function WorkspaceFrame() {
  const { t } = useTranslation()
  const pages = [
    { key: 'p1', label: t('themeCompare.sample.title', 'On Reading by Warm Light'), active: true },
    { key: 'p2', label: t('themeCompare.frame.p2', 'Field notes'), active: false },
    { key: 'p3', label: t('themeCompare.frame.p3', 'The night shelf'), active: false },
    { key: 'p4', label: t('themeCompare.frame.p4', 'Margins & marginalia'), active: false },
  ]
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>
      {/* Title bar */}
      <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', background: 'var(--titlebar, var(--surface))', borderBottom: '1px solid var(--line, var(--border-color))' }}>
        <span style={{ display: 'flex', gap: 7 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--ink-3, var(--text-muted))', opacity: 0.45 }} />
          ))}
        </span>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 500, color: 'var(--ink-2, var(--text-secondary))' }}>
          {t('themeCompare.sample.title', 'On Reading by Warm Light')}
        </span>
        <PrismMark size={22} />
      </div>
      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Page rail */}
        <div style={{ width: 264, flexShrink: 0, background: 'var(--surface-2, var(--bg-secondary))', borderRight: '1px solid var(--line, var(--border-color))', padding: '22px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 14px' }}>
            <PrismMark size={22} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--ink, var(--text-primary))' }}>Prism</span>
          </div>
          {pages.map((p) => (
            <div
              key={p.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, fontSize: 14,
                background: p.active ? 'var(--accent-soft, var(--bg-secondary))' : 'transparent',
                color: p.active ? 'var(--accent-color)' : 'var(--ink-2, var(--text-secondary))',
                fontWeight: p.active ? 600 : 400,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.active ? 'var(--accent-color)' : 'var(--ink-3, var(--text-muted))', opacity: p.active ? 1 : 0.5 }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: 13, color: 'var(--ink-3, var(--text-muted))' }}>
            <Plus size={14} />
            <span>{t('sidebar.newPage', 'New page')}</span>
          </div>
        </div>
        {/* Reading column */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', background: 'var(--bg)', padding: '40px 32px' }}>
          <div
            className="markdown-body"
            style={{ background: 'var(--paper)', color: 'var(--ink, var(--text-primary))', border: '1px solid var(--line, var(--border-color))', borderRadius: 14, boxShadow: 'var(--shadow-lg)', padding: '2.4rem 2.6rem 2.6rem', maxWidth: 720, margin: '0 auto' }}
          >
            <SampleDoc />
          </div>
        </div>
      </div>
    </div>
  )
}

/** A scoped, themed artboard card (literal W×H). */
function ScopedArtboard({ theme, active, style }: { theme: ThemeDefinition; active: boolean; style?: React.CSSProperties }) {
  const scopeStyle = { ...theme.colors, background: theme.colors['--bg'], width: W, height: H, ...style } as React.CSSProperties
  return (
    <div
      data-identity={theme.id}
      data-kind={theme.isDark ? 'dark' : 'light'}
      className="prism-compare-tile pc-card"
      style={{ position: 'relative', borderRadius: 3, overflow: 'hidden', boxShadow: active ? `0 1px 3px rgba(0,0,0,.08), 0 8px 30px rgba(0,0,0,.12), 0 0 0 2px ${DC.accent}` : '0 1px 3px rgba(0,0,0,.08), 0 6px 22px rgba(0,0,0,.07)', isolation: 'isolate', ...scopeStyle }}
    >
      <WorkspaceFrame />
    </div>
  )
}

/** One slot in the canvas row: counter-scaled label bar above a scaled card. */
function Artboard({ theme, label, active, onExpand, onApply }: {
  theme: ThemeDefinition; label: string; active: boolean; onExpand: () => void; onApply: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="pc-slot" style={{ position: 'relative', width: W, height: H, flexShrink: 0 }}>
      {/* Label bar — counter-scaled (via --pc-inv set imperatively on worldRef)
          to stay constant on-screen size at any zoom, with no React re-render. */}
      <div
        style={{
          position: 'absolute', bottom: '100%', left: -2, marginBottom: 'calc(8px * var(--pc-inv, 1))', transformOrigin: 'bottom left', transform: 'scale(var(--pc-inv, 1))',
          display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', fontFamily: DC.font,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: DC.label, lineHeight: 1 }}>{label}</span>
        {active && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: DC.accent }}>
            <Check size={13} />{t('themeCompare.active', 'Current')}
          </span>
        )}
        <span className="pc-btns" style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-pc-nopan>
          {!active && (
            <button
              onClick={onApply}
              style={{ fontFamily: DC.font, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#2a251f', color: '#fff', cursor: 'pointer' }}
            >
              {t('themeCompare.apply', 'Use this identity')}
            </button>
          )}
          <button
            className="pc-iconbtn"
            onClick={onExpand}
            title={t('themeCompare.focus', 'Open full-screen')}
            aria-label={t('themeCompare.focus', 'Open full-screen')}
            style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DC.label, background: 'transparent', cursor: 'pointer' }}
          >
            {EXPAND_ICON}
          </button>
        </span>
      </div>
      <ScopedArtboard theme={theme} active={active} />
    </div>
  )
}

/** Fullscreen focus overlay — fit-to-viewport, ←/→ wraps, Esc closes. */
function FocusOverlay({ identities, index, labels, activeId, onIndex, onClose, onApply }: {
  identities: ThemeDefinition[]; index: number; labels: Record<string, string>; activeId: string
  onIndex: (i: number) => void; onClose: () => void; onApply: (id: string) => void
}) {
  const { t } = useTranslation()
  const theme = identities[index]
  const rootRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Own focus trap while mounted: moves focus in on open, restores on close.
  useFocusTrap(rootRef, true)
  const scale = Math.max(0.1, Math.min((vp.w - 200) / W, (vp.h - 260) / H, 2))
  const active = theme.id === activeId

  return (
    <div
      ref={rootRef}
      style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(24,20,16,.6)', backdropFilter: 'blur(14px)', color: '#fff', fontFamily: DC.font }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px 0' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>{labels[theme.id]}</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>{theme.blurb}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {active ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,.14)' }}>
              <Check size={15} />{t('themeCompare.active', 'Current')}
            </span>
          ) : (
            <button
              onClick={() => onApply(theme.id)}
              style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: theme.colors['--accent-color'], color: theme.colors['--accent-ink'] ?? '#fff', cursor: 'pointer' }}
            >
              {t('themeCompare.apply', 'Use this identity')}
            </button>
          )}
          <button onClick={onClose} title={t('common.close', 'Close')} aria-label={t('common.close', 'Close')} style={{ width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.7)', background: 'transparent', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Centered scaled card */}
      <div style={{ position: 'absolute', top: 64, bottom: 56, left: 100, right: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ width: W * scale, height: H * scale, position: 'relative' }}>
          <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', borderRadius: 3, overflow: 'hidden', boxShadow: '0 20px 80px rgba(0,0,0,.4)' }}>
            <ScopedArtboard theme={theme} active={active} />
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, opacity: 0.85 }}>
          {labels[theme.id]}
          <span style={{ opacity: 0.5, marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>{index + 1} / {identities.length}</span>
        </div>
      </div>

      {/* Arrows */}
      <button className="pc-arrow" onClick={() => onIndex((index - 1 + identities.length) % identities.length)} aria-label={t('themeCompare.prev', 'Previous')} style={{ position: 'absolute', top: '50%', left: 28, transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)', cursor: 'pointer' }}>
        <svg width={18} height={18} viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button className="pc-arrow" onClick={() => onIndex((index + 1) % identities.length)} aria-label={t('themeCompare.next', 'Next')} style={{ position: 'absolute', top: '50%', right: 28, transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)', cursor: 'pointer' }}>
        <svg width={18} height={18} viewBox="0 0 18 18" fill="none"><path d="M7 3l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {/* Dots */}
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
        {identities.map((it, i) => (
          <button key={it.id} onClick={() => onIndex(i)} aria-label={labels[it.id]} style={{ width: 6, height: 6, borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer', background: i === index ? '#fff' : 'rgba(255,255,255,.3)' }} />
        ))}
      </div>
    </div>
  )
}

export function ThemeCompare() {
  const { t } = useTranslation()
  const open = useUIStore((s) => s.compareOpen)
  const close = useUIStore((s) => s.closeCompare)
  const themeId = useSettingsStore((s) => s.themeId)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)

  const identities = themes.filter((th) => th.blurb)
  const labels: Record<string, string> = {
    parchment: `Parchment · ${t('themeCompare.labels.parchment', 'warm daylight')}`,
    campfire: `Campfire · ${t('themeCompare.labels.campfire', 'espresso dark')}`,
    newsprint: `Newsprint · ${t('themeCompare.labels.newsprint', 'editorial')}`,
  }

  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const tf = useRef({ x: 0, y: 0, scale: 0.3 })
  const drag = useRef<{ id: number; lx: number; ly: number } | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  // Hand the trap to the FocusOverlay when it's open, so Tab doesn't walk the
  // artboard buttons hidden behind it (the overlay runs its own trap).
  useFocusTrap(overlayRef, open && focusIndex === null)

  const apply = (id: string) => {
    setThemeId(id)
    if (themeMode === 'system') setThemeMode('manual')
  }

  const applyTransform = () => {
    const w = worldRef.current
    if (!w) return
    const { x, y, scale } = tf.current
    w.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    w.style.setProperty('--pc-inv', String(1 / scale))
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`
  }

  const zoomAt = (cx: number, cy: number, factor: number) => {
    const c = canvasRef.current
    if (!c) return
    const r = c.getBoundingClientRect()
    const px = cx - r.left, py = cy - r.top
    const next = clampScale(tf.current.scale * factor)
    const k = next / tf.current.scale
    tf.current.x = px - (px - tf.current.x) * k
    tf.current.y = py - (py - tf.current.y) * k
    tf.current.scale = next
    applyTransform()
  }

  const zoomButton = (factor: number) => {
    const c = canvasRef.current
    if (!c) return
    const r = c.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }

  // Fit the whole canvas into view on open / resize.
  const fit = () => {
    const c = canvasRef.current
    if (!c) return
    const vw = c.clientWidth, vh = c.clientHeight
    const scale = clampScale(Math.min(vw / CONTENT_W, vh / CONTENT_H) * 0.92)
    tf.current = { x: (vw - CONTENT_W * scale) / 2, y: (vh - CONTENT_H * scale) / 2, scale }
    applyTransform()
  }

  useLayoutEffect(() => {
    if (!open) return
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Native, non-passive wheel listener so we can preventDefault for zoom/pan.
  useEffect(() => {
    if (!open) return
    const c = canvasRef.current
    if (!c) return
    const isMouseWheel = (e: WheelEvent) =>
      e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      } else if (isMouseWheel(e)) {
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18))
      } else {
        tf.current.x -= e.deltaX
        tf.current.y -= e.deltaY
        applyTransform()
      }
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keyboard: Esc unwinds focus → gallery; ←/→ navigate in focus.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (focusIndex !== null) setFocusIndex(null)
        else close()
        return
      }
      if (focusIndex !== null) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setFocusIndex((focusIndex - 1 + identities.length) % identities.length) }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setFocusIndex((focusIndex + 1) % identities.length) }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, focusIndex, identities.length, close])

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 0 && target.closest('button, [data-pc-nopan]')) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, lx: e.clientX, ly: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    tf.current.x += e.clientX - d.lx
    tf.current.y += e.clientY - d.ly
    d.lx = e.clientX; d.ly = e.clientY
    applyTransform()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) {
      drag.current = null
      canvasRef.current?.releasePointerCapture(e.pointerId)
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
    }
  }

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('themeCompare.title', 'Prism — three identities')}
      tabIndex={-1}
      className="fixed inset-0 prism-fade-in"
      style={{ zIndex: 120, background: DC.bg, overflow: 'hidden' }}
    >
      <style>{CANVAS_CSS}</style>

      {/* Pannable / zoomable canvas */}
      <div
        ref={canvasRef}
        className="pc-canvas"
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab', touchAction: 'none', overscrollBehavior: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={worldRef} style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', willChange: 'transform', width: CONTENT_W, paddingTop: TOPPAD + LABEL_H, paddingBottom: BOTTOMPAD }}>
          <div className="pc-grid" style={{ position: 'absolute', inset: -6000, pointerEvents: 'none', zIndex: -1 }} />
          {/* Artboard row */}
          <div style={{ display: 'flex', gap: GAP, padding: `0 ${SIDEPAD}px`, alignItems: 'flex-start' }}>
            {identities.map((theme, i) => (
              <Artboard
                key={theme.id}
                theme={theme}
                label={labels[theme.id]}
                active={themeId === theme.id}
                onExpand={() => setFocusIndex(i)}
                onApply={() => apply(theme.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Screen-fixed header (constant size, always legible on the warm grid) */}
      <div style={{ position: 'absolute', top: 22, left: 26, zIndex: 5, fontFamily: DC.font, maxWidth: '56vw', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <svg width={26} height={26} viewBox="0 0 100 100" fill="none" aria-hidden>
            <path d="M50 14 L86 78 L14 78 Z" stroke="#2c2620" strokeWidth={3} strokeLinejoin="round" />
            <path d="M50 14 L50 78" stroke="#b06a2c" strokeWidth={2} />
            <path d="M62 56 L90 44" stroke="#c2532f" strokeWidth={2.5} />
            <path d="M62 60 L92 56" stroke="#c98a2a" strokeWidth={2.5} />
            <path d="M62 64 L90 68" stroke="#5b8b4e" strokeWidth={2.5} />
          </svg>
          <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.4px', color: DC.title }}>
            {t('themeCompare.title', 'Prism — three identities')}
          </span>
        </div>
        <div style={{ fontSize: 14, color: DC.subtitle, maxWidth: 560, lineHeight: 1.4 }}>
          {t('themeCompare.subtitle', 'The same workspace, one document, three warm reading systems. Drag to compare — open any frame full-screen with ⤢.')}
        </div>
      </div>

      {/* Screen-fixed chrome */}
      <button
        onClick={close}
        title={t('common.close', 'Close')}
        aria-label={t('common.close', 'Close')}
        style={{ position: 'absolute', top: 18, right: 18, width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5b5346', background: 'rgba(255,255,255,.6)', backdropFilter: 'blur(4px)', cursor: 'pointer', zIndex: 5 }}
      >
        <X size={18} />
      </button>

      {/* Hint */}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontFamily: DC.font, fontSize: 12, fontWeight: 500, color: '#fff', background: 'rgba(30,24,18,.72)', padding: '6px 14px', borderRadius: 20, backdropFilter: 'blur(4px)', pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap' }}>
        {t('themeCompare.hint', 'Drag to pan · scroll to zoom · ⤢ to open full-screen')}
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 16, right: 18, display: 'flex', alignItems: 'center', gap: 2, fontFamily: DC.font, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: 3, zIndex: 5 }}>
        <button className="pc-zoombtn" onClick={() => zoomButton(Math.exp(-0.22))} aria-label={t('themeCompare.zoomOut', 'Zoom out')} style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5b5346', cursor: 'pointer' }}><Minus size={15} /></button>
        <button className="pc-zoombtn" onClick={fit} title={t('themeCompare.fit', 'Fit')} style={{ minWidth: 48, height: 28, borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#5b5346', cursor: 'pointer' }}>
          <span ref={zoomLabelRef}>30%</span>
        </button>
        <button className="pc-zoombtn" onClick={() => zoomButton(Math.exp(0.22))} aria-label={t('themeCompare.zoomIn', 'Zoom in')} style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5b5346', cursor: 'pointer' }}><Plus size={15} /></button>
      </div>

      {focusIndex !== null && (
        <FocusOverlay
          identities={identities}
          index={focusIndex}
          labels={labels}
          activeId={themeId}
          onIndex={setFocusIndex}
          onClose={() => setFocusIndex(null)}
          onApply={apply}
        />
      )}
    </div>
  )
}
