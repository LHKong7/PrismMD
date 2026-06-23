/**
 * shelfBooks — renders real workspace pages as pixel book spines on the atrium
 * shelf, sized + coloured by their book-skin metadata (shared with the Stacks
 * overlay via bookSkin's genreColors / statusFlags / goldPctOf). Lays spines
 * left-to-right across the shelf rows, wrapping; returns each spine's world
 * rect so the world can hit-test clicks. Bounded by shelf capacity.
 */

import { Container, Graphics } from 'pixi.js'
import { hexNum } from './roomBuild'
import { genreColors, statusFlags, goldPctOf } from '../bookSkin'

export interface ShelfBook {
  pageId: string
  title: string
  status: string | null
  genre: string | null
  quality: number | null
  length: number
}

export interface ShelfRow {
  x: number
  y: number
  w: number
  h: number
}

export interface ShelfSpine {
  pageId: string
  x: number
  y: number
  w: number
  h: number
}

/** Inner shelf rows of the atrium bookshelf (baseline = y + h). */
export const SHELF_ROWS: ShelfRow[] = [
  { x: 70, y: 78, w: 228, h: 44 },
  { x: 70, y: 128, w: 228, h: 44 },
  { x: 70, y: 178, w: 228, h: 44 },
  { x: 70, y: 222, w: 228, h: 40 },
]

export function drawShelfBooks(books: ShelfBook[], rows: ShelfRow[]): { container: Container; spines: ShelfSpine[] } {
  const container = new Container()
  const spines: ShelfSpine[] = []
  if (!rows.length) return { container, spines }

  let ri = 0
  let cx = rows[0].x

  for (const b of books) {
    const len = b.length || 0
    const w = Math.max(7, Math.min(16, 7 + Math.round(len / 1400)))

    // Wrap to the next row when the current one is full.
    if (cx + w > rows[ri].x + rows[ri].w) {
      ri++
      if (ri >= rows.length) break
      cx = rows[ri].x
    }
    const row = rows[ri]
    const h = Math.max(26, Math.min(row.h - 2, 26 + Math.round(len / 800)))
    const x = cx
    const y = row.y + row.h - h

    const g = genreColors(b.genre)
    const sf = statusFlags(b.status)

    const spine = new Container()
    spine.x = x
    spine.y = y

    if (sf.hot) {
      const glow = new Graphics().roundRect(-3, -3, w + 6, h + 6, 3).fill({ color: 0xffb450, alpha: 0.45 })
      spine.addChild(glow)
    }

    const body = new Graphics()
    body.rect(0, 0, w, h).fill(hexNum(g.base))
    body.rect(0, 0, w, Math.max(3, Math.round(h * 0.18))).fill(hexNum(g.top))
    body.rect(w - 2, 0, 2, h).fill({ color: 0x000000, alpha: 0.3 })
    if (g.material === 'metal') body.rect(1, 0, 1, h).fill({ color: 0xffffff, alpha: 0.4 })
    const goldPct = goldPctOf(b.quality)
    if (goldPct > 0) {
      const gh = Math.max(2, Math.round(h * goldPct))
      body.rect(0, h - gh, w, gh).fill(0xd4a748)
    }
    body.rect(0, 0, w, h).stroke({ width: 1, color: 0x000000, alpha: 0.35 })
    spine.addChild(body)

    if (sf.revise) spine.addChild(new Graphics().circle(w / 2, 3, 2.4).fill(0xd8402a))
    if (sf.draft) spine.alpha = 0.6

    container.addChild(spine)
    spines.push({ pageId: b.pageId, x, y, w, h })
    cx += w + 2
  }

  return { container, spines }
}
