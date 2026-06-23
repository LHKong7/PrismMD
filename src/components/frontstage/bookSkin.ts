/**
 * bookSkin — maps a page's editorial metadata to a pixel book spine.
 *
 *   length  → thickness + height (thick book / thin book)
 *   genre   → base colour + material (tech=metal/blue, biz=leather/dark,
 *             essay=iris journal, note=amber journal)
 *   quality → height of the gold-foil band at the spine's foot (0–5 → 0–100%)
 *   status  → draft (faded), done (full), revise (! badge), hot (glow)
 */

export interface SkinInput {
  status: string | null
  genre: string | null
  quality: number | null
  length: number
}

export interface BookSkin {
  w: number
  h: number
  base: string
  top: string
  material: string
  goldPct: number
  opacity: number
  badge: 'revise' | null
  hot: boolean
}

const GENRE: Record<string, { base: string; top: string; material: string }> = {
  tech: { base: '#2f5a73', top: '#4a7d9c', material: 'metal' },
  biz: { base: '#3a2218', top: '#5a3a28', material: 'leather' },
  essay: { base: '#5a4a90', top: '#8a78c0', material: 'journal' },
  note: { base: '#a8721f', top: '#caa84a', material: 'journal' },
}
const DEFAULT_GENRE = { base: '#6a4a2c', top: '#8a6038', material: 'cloth' }

/** Genre → base/top colour + material. Shared by the overlay and the Pixi shelf. */
export function genreColors(genre: string | null): { base: string; top: string; material: string } {
  return (genre && GENRE[genre]) || DEFAULT_GENRE
}

/** Quality (0–5) → gold-foil proportion (0–1). */
export function goldPctOf(quality: number | null): number {
  return quality != null ? Math.max(0, Math.min(1, quality / 5)) : 0
}

/** Status → visual flags (draft fades, revise badges, hot glows). */
export function statusFlags(status: string | null): { draft: boolean; revise: boolean; hot: boolean } {
  return { draft: !status || status === 'draft', revise: status === 'revise', hot: status === 'hot' }
}

export function bookSkin(s: SkinInput): BookSkin {
  const g = genreColors(s.genre)
  const sf = statusFlags(s.status)
  const len = s.length || 0
  const w = Math.max(30, Math.min(64, 30 + Math.round(len / 500)))
  const h = Math.max(108, Math.min(170, 108 + Math.round(len / 260)))
  return {
    w,
    h,
    base: g.base,
    top: g.top,
    material: g.material,
    goldPct: goldPctOf(s.quality),
    opacity: sf.draft ? 0.62 : 1,
    badge: sf.revise ? 'revise' : null,
    hot: sf.hot,
  }
}

export const STATUS_KEYS = ['draft', 'done', 'revise', 'hot'] as const
export const GENRE_KEYS = ['tech', 'biz', 'essay', 'note'] as const
