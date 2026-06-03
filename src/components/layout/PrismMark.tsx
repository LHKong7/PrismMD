/**
 * PrismMark — the "reading instrument" logo: a triangular prism refracting a
 * spectrum. Strokes ride the theme via CSS variables (the triangle is --ink,
 * the inner ray --accent) while the refracted beams keep their spectrum hues so
 * the prism motif reads in every identity. Used in the title bar and the
 * Settings → About panel.
 */
export function PrismMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M50 16 L84 76 L16 76 Z" stroke="var(--text-primary)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M50 16 L50 76" stroke="var(--accent-color)" strokeWidth="2.5" />
      <path d="M60 54 L88 42" stroke="var(--spectrum-1)" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 59 L90 56" stroke="var(--spectrum-3)" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 64 L88 70" stroke="var(--spectrum-4)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
