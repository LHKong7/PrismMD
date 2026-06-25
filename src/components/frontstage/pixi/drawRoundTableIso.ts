/**
 * drawRoundTableIso — 写作圆桌 / The Round Table, rendered in 2:1 isometric.
 *
 * A warm meeting room seen from a low iso angle: a diamond-tiled wood floor with
 * a round carpet, two rising walls (a moonlit window on the right, a bookshelf
 * and a door on the left), wall sconces, a hanging three-bulb lamp, and a round
 * table strewn with papers, a quill and a candle. Lighting is additive bloom; a
 * cool night wash sits over everything and warm motes drift up.
 *
 * Returns three layers in an offset wrapper the world positions at (ox, oy):
 *   back  — floor, carpet, walls, fixtures (static, behind everyone)
 *   ent   — sortable entity layer; this build adds the TABLE, the world adds the
 *           scribes, player and prompt, each z-sorted by screen-y
 *   fx    — night wash, additive glows, drifting motes (on top)
 *
 * The world owns movement/projection; this module only draws and exposes the
 * animated bits (glows / motes) plus the entity layer + table for depth sorting.
 */

import { Container, Graphics } from 'pixi.js'
import { makeGlowAdd, makeMotesAdd, nightWash, PALETTE, type Mote } from './roomBuild'
import type { IsoConfig } from '../sceneConfig'

export interface IsoRoundTableBuild {
  /** Offset wrapper (world positions it at ox/oy); holds back + ent + fx + ui. */
  container: Container
  /** Sortable entity layer (table added here; world adds scribes + player). */
  ent: Container
  /** Top-most layer above the FX wash/glows — the world parents the prompt here. */
  ui: Container
  /** Display objects whose alpha the world's ticker pulses. */
  glows: Container[]
  /** Drifting additive motes the ticker animates. */
  motes: Mote[]
}

export function drawRoundTableIso(cfg: IsoConfig): IsoRoundTableBuild {
  const { N, hw, hh, wallH } = cfg
  const iso = (gx: number, gy: number) => ({ x: (gx - gy) * hw, y: (gx + gy) * hh })

  const container = new Container()
  const back = new Container()
  const ent = new Container()
  ent.sortableChildren = true
  const fx = new Container()
  const ui = new Container()
  container.addChild(back, ent, fx, ui)

  const glows: Container[] = []

  // ── Floor: diamond checker + grid lines ──
  const floor = new Graphics()
  for (let gx = 0; gx < N; gx++) {
    for (let gy = 0; gy < N; gy++) {
      const a = iso(gx, gy)
      const b = iso(gx + 1, gy)
      const c = iso(gx + 1, gy + 1)
      const e = iso(gx, gy + 1)
      floor.poly([a.x, a.y, b.x, b.y, c.x, c.y, e.x, e.y]).fill((gx + gy) % 2 === 0 ? 0x7a5436 : 0x6c4830)
    }
  }
  for (let gx = 0; gx <= N; gx++) {
    const p0 = iso(gx, 0)
    const p1 = iso(gx, N)
    floor.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y)
  }
  for (let gy = 0; gy <= N; gy++) {
    const p0 = iso(0, gy)
    const p1 = iso(N, gy)
    floor.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y)
  }
  floor.stroke({ width: 1, color: 0x3f2a1a, alpha: 0.35 })
  back.addChild(floor)

  // ── Round carpet ──
  const C = iso(N / 2, N / 2)
  const carpet = new Graphics()
  carpet.ellipse(C.x, C.y, 188, 100).fill(0x5f2a34)
  carpet.ellipse(C.x, C.y, 152, 81).fill(0x6e3340)
  carpet.ellipse(C.x, C.y, 170, 90).stroke({ width: 3, color: 0xd8a85a, alpha: 0.85 })
  back.addChild(carpet)

  // ── Walls ──
  const Ow = iso(0, 0)
  const dL = { x: -hw, y: hh }
  const dR = { x: hw, y: hh }
  // Quad on wall `w` from u0..u1 along the floor edge, rising y0..y1 in height.
  const wp = (w: 'L' | 'R', u0: number, u1: number, y0: number, y1: number): number[] => {
    const d = w === 'L' ? dL : dR
    return [
      Ow.x + d.x * u0, Ow.y + d.y * u0 - y0,
      Ow.x + d.x * u1, Ow.y + d.y * u1 - y0,
      Ow.x + d.x * u1, Ow.y + d.y * u1 - y1,
      Ow.x + d.x * u0, Ow.y + d.y * u0 - y1,
    ]
  }
  const wg = new Graphics()
  wg.poly(wp('R', 0, N, 0, wallH)).fill(0x3f2e1e)
  wg.poly(wp('L', 0, N, 0, wallH)).fill(0x33261a)
  for (let u = 0; u < N; u += 2) {
    wg.poly(wp('R', u, u + 1, 0, wallH)).fill({ color: 0x3a2c1c, alpha: 0.5 })
    wg.poly(wp('L', u, u + 1, 0, wallH)).fill({ color: 0x2c2014, alpha: 0.5 })
  }
  for (let u = 0; u <= N; u++) {
    const pr = wp('R', u, u, 0, wallH)
    wg.moveTo(pr[0], pr[1]).lineTo(pr[4], pr[5])
    const pl = wp('L', u, u, 0, wallH)
    wg.moveTo(pl[0], pl[1]).lineTo(pl[4], pl[5])
  }
  wg.stroke({ width: 1, color: 0x241a10, alpha: 0.6 })
  wg.poly(wp('R', 0, N, wallH - 14, wallH)).fill(0x4a3826) // top trim
  wg.poly(wp('L', 0, N, wallH - 14, wallH)).fill(0x3c2c1c)
  wg.poly(wp('R', 0, N, 0, 16)).fill(0x2a1e12) // baseboard
  wg.poly(wp('L', 0, N, 0, 16)).fill(0x231a10)

  // Window + moon (right wall)
  wg.poly(wp('R', 5.2, 7.4, 108, 196)).fill(0x23344e)
  const moon = wp('R', 6.4, 6.4, 168, 168)
  wg.circle(moon[0], moon[1], 11).fill(0xf0e6c8)
  wg.circle(moon[0] + 6, moon[1] - 3, 11).fill(0x23344e) // crescent shadow
  wg.poly(wp('R', 5.2, 7.4, 108, 196)).stroke({ width: 4, color: 0x4a3624 })
  const mv = wp('R', 6.3, 6.3, 108, 196)
  wg.moveTo(mv[0], mv[1]).lineTo(mv[4], mv[5]).stroke({ width: 2, color: 0x4a3624 })
  const mh = wp('R', 5.2, 7.4, 152, 152)
  wg.moveTo(mh[0], mh[1]).lineTo(mh[2], mh[3]).stroke({ width: 2, color: 0x4a3624 })

  // Bookshelf (left wall) — the Archive
  wg.poly(wp('L', 2, 4.2, 80, 196)).fill(0x2a1d12)
  wg.poly(wp('L', 2, 4.2, 80, 196)).stroke({ width: 3, color: 0x4a3624 })
  for (const yy of [120, 162]) {
    const s = wp('L', 2, 4.2, yy, yy)
    wg.moveTo(s[0], s[1]).lineTo(s[2], s[3])
  }
  wg.stroke({ width: 2, color: 0x3a2a1a, alpha: 0.7 })
  const bc = [0x7a4a3a, 0x4a6a5a, 0x6a5a3a, 0x5a4a6a, 0x7a5a3a]
  for (let i = 0; i < 5; i++) {
    wg.poly(wp('L', 2.2 + i * 0.36, 2.2 + i * 0.36 + 0.28, 124, 159)).fill(bc[i % 5])
  }

  // Door (left wall) — back to the Guild Hall
  wg.poly(wp('L', 6.4, 8.2, 0, 178)).fill(0x4a3320)
  wg.poly(wp('L', 6.5, 8.1, 8, 172)).stroke({ width: 4, color: 0x5a4228 })
  const knob = wp('L', 7.85, 7.85, 92, 92)
  wg.circle(knob[0], knob[1], 4).fill(0xd8a85a)

  // Sconces (one per wall)
  const sconces: Array<['L' | 'R', number, number]> = [['L', 5, 138], ['R', 3, 138]]
  for (const [w, u, y] of sconces) {
    const p = wp(w, u, u, y, y)
    wg.roundRect(p[0] - 5, p[1] - 4, 10, 16, 2).fill(0x3a2a18)
    wg.circle(p[0], p[1] - 6, 3).fill(0xffd9a0)
    glows.push(makeGlowAdd(p[0], p[1] - 6, 78, 0xffb24d))
  }

  // Hanging lamp (three bulbs over the table)
  const lampY = -wallH + 64
  wg.moveTo(C.x - 60, -wallH + 8).lineTo(C.x - 60, lampY)
  wg.moveTo(C.x + 60, -wallH + 8).lineTo(C.x + 60, lampY).stroke({ width: 3, color: 0x2a1e12 })
  wg.roundRect(C.x - 72, lampY, 144, 12, 4).fill(0x4a3624)
  for (const off of [-46, 0, 46]) {
    wg.roundRect(C.x + off - 3, lampY + 12, 6, 10, 2).fill(0x2a1e12)
    wg.circle(C.x + off, lampY + 26, 6).fill(0xffd9a0)
    glows.push(makeGlowAdd(C.x + off, lampY + 26, 62, 0xffc46a))
  }
  back.addChild(wg)

  // Warm pool under the table (kept modest so the room isn't washed out)
  glows.push(makeGlowAdd(C.x, C.y - 30, 180, 0xffb24d))

  // ── Round table (in the sortable entity layer) ──
  const cx = C.x
  const cy = C.y
  const tRX = 122
  const tRY = 63
  const tH = 46
  const tbl = new Graphics()
  tbl.ellipse(cx, cy + 12, tRX + 12, tRY + 8).fill({ color: 0x000000, alpha: 0.28 }) // floor shadow
  tbl.ellipse(cx, cy, tRX, tRY).fill(0x3a2616) // bottom rim
  tbl.rect(cx - tRX, cy - tH, tRX * 2, tH).fill(0x4a3320) // side
  tbl.ellipse(cx, cy - tH, tRX, tRY).fill(0x8a5a36) // top
  tbl.ellipse(cx, cy - tH, tRX - 16, tRY - 12).fill(0x9a6a42) // inner top
  tbl.ellipse(cx, cy - tH, tRX, tRY).stroke({ width: 4, color: 0xd8a85a, alpha: 0.9 }) // gold rim
  tbl.roundRect(cx - 38, cy - tH - 12, 42, 30, 3).fill(0xf1e6cc) // papers
  tbl.roundRect(cx + 4, cy - tH - 2, 40, 27, 3).fill(0xe9dcbe)
  tbl.roundRect(cx - 14, cy - tH + 8, 38, 25, 3).fill(0xf1e6cc)
  tbl.rect(cx + 34, cy - tH - 16, 3, 18).fill(0x2a2a3a) // pen
  const cax = cx + 56
  const cay = cy - tH - 2
  tbl.roundRect(cax - 3, cay - 16, 6, 16, 2).fill(0xe8e0cc) // candle stick
  tbl.ellipse(cax, cay - 20, 3.5, 6).fill(0xffb24d) // flame
  // −1 so an entity exactly level with the table centre (screen-y === cy)
  // resolves by its own screen-y rather than insertion order (avoids tie flips).
  tbl.zIndex = Math.round(cy) - 1
  ent.addChild(tbl)
  glows.push(makeGlowAdd(cax, cay - 18, 60, 0xffc46a)) // candle bloom

  // ── FX: night wash (below glows), glows, motes (top) ──
  // Same cool moonlight hue as every other room — just a touch deeper here since
  // this is the dark, night-meeting room.
  fx.addChild(nightWash({ x: -1500, y: -800, w: 3000, h: 1700 }, 0.28))
  for (const g of glows) fx.addChild(g)
  const { container: moteC, motes } = makeMotesAdd({ x: -380, y: -180, w: 760, h: 540 }, 46, PALETTE.mote)
  fx.addChild(moteC)

  return { container, ent, ui, glows, motes }
}
