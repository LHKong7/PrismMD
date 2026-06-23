/**
 * drawAtrium — the 烛笺阁 entrance hall (hub), the most-seen room. Plank floor
 * with a window light-beam + lamp pools, panelled wall with a framed picture
 * and wall sconces, a moonlit rainy window, shaded furniture (desk + candle,
 * armchair, fireplace with a warm bloom), a potted plant, and drifting motes.
 * The bookshelf is a frame + boards; real books are drawn data-driven on top.
 */

import { Container, Graphics } from 'pixi.js'
import { makeGlow, lightPool, plankFloor, shadedBox, makeMotes, shade, type RainDrop, type RoomBuild } from './roomBuild'
import { SHELF_ROWS } from './shelfBooks'

export function drawAtrium(): RoomBuild {
  const container = new Container()
  const flames: Graphics[] = []
  const glows: Graphics[] = []
  const rains: RainDrop[] = []

  // ── Wall + wainscot ──
  const wall = new Graphics()
  wall.rect(0, 0, 960, 300).fill(0x2f231b)
  for (let x = 0; x < 960; x += 48) wall.rect(x + 46, 0, 2, 230).fill(0x281d16)
  wall.rect(0, 0, 960, 60).fill(shade(0x2f231b, -0.05))
  wall.rect(0, 226, 960, 8).fill(0x5a4029)
  wall.rect(0, 234, 960, 66).fill(0x4a3527)
  for (let x = 24; x < 960; x += 96) {
    wall.roundRect(x, 244, 72, 46, 3).fill(shade(0x4a3527, -0.08)).stroke({ width: 2, color: shade(0x4a3527, 0.12) })
  }
  wall.rect(0, 296, 960, 4).fill(0x2e2014)
  container.addChild(wall)

  // ── Floor ──
  const floor = new Graphics()
  plankFloor(floor, { x: 0, y: 300, w: 960, h: 300 }, 0x5e3e25, 58)
  container.addChild(floor)

  // Window light beam (subtle, over the floor)
  const beam = new Graphics()
  beam.poly([382, 216, 506, 216, 560, 540, 332, 540]).fill({ color: 0x9fb6e0, alpha: 0.05 })
  container.addChild(beam)
  container.addChild(lightPool(769, 300, 150, 60, 0xff8a3c, 0.1))

  // Rug with medallion
  const rug = new Graphics()
  rug.roundRect(312, 404, 300, 150, 6).fill(0x8a3a32)
  for (let i = 0; i < 14; i++) rug.rect(312 + i * 22, 404, 11, 150).fill(0x7a3028)
  rug.roundRect(330, 420, 264, 118, 4).stroke({ width: 3, color: 0xc49a5a })
  rug.ellipse(462, 479, 60, 34).fill({ color: 0xb98a3a, alpha: 0.4 })
  rug.roundRect(312, 404, 300, 150, 6).stroke({ width: 5, color: 0xb98a3a })
  container.addChild(rug)

  // ── Bookshelf frame + shelf boards (real books drawn on top by the world) ──
  const shelf = new Graphics()
  shelf.roundRect(56, 60, 248, 206, 4).fill(0x3a2614).stroke({ width: 4, color: 0x2e1d0f })
  shelf.rect(64, 68, 232, 192).fill(0x261812)
  for (const row of SHELF_ROWS) shelf.rect(64, row.y + row.h, 232, 4).fill(0x46301c)
  shelf.rect(56, 56, 248, 6).fill(0x4a3019).stroke({ width: 2, color: 0x2e1d0f })
  container.addChild(shelf)

  // Framed picture on the wall (between shelf and window)
  const frame = new Graphics()
  shadedBox(frame, 320, 96, 30, 64, 0x6a4828, { radius: 3 })
  frame.rect(326, 104, 18, 48).fill(0x2d3f5a)
  frame.poly([326, 152, 335, 128, 344, 152]).fill(0x3a6f8f)
  frame.circle(338, 116, 4).fill(0xe8c05a)
  container.addChild(frame)

  // Wall sconces (warm points)
  for (const sx of [336, 600]) {
    container.addChild(makeGlow(sx, 150, 34, 0xffc46a))
    const sc = new Graphics()
    sc.roundRect(sx - 4, 150, 8, 14, 2).fill(0x6a4828).stroke({ width: 1.5, color: 0x3a2412 })
    sc.ellipse(sx, 148, 4, 6).fill(0xffd27a)
    container.addChild(sc)
  }

  // ── Window + moon + rain ──
  const win = new Graphics()
  win.rect(360, 64, 168, 150).fill(0x16203a)
  win.rect(360, 64, 168, 150).fill({ color: 0x2a3c5c, alpha: 0.5 })
  win.circle(486, 100, 16).fill(0xf2ead0)
  win.circle(492, 96, 14).fill(0x2a3c5c)
  win.ellipse(410, 120, 26, 7).fill({ color: 0x3a4d6e, alpha: 0.8 })
  win.ellipse(450, 150, 30, 8).fill({ color: 0x33456a, alpha: 0.7 })
  container.addChild(win)
  for (let i = 0; i < 16; i++) {
    const x = 368 + ((i * 11) % 152)
    const drop = new Graphics().rect(0, 0, 2, 12).fill({ color: 0xb4cdf0, alpha: 0.65 })
    drop.x = x
    container.addChild(drop)
    rains.push({ g: drop, speed: 150, phase: (i % 8) * 22, topY: 66, botY: 210, x })
  }
  const winFrame = new Graphics()
  winFrame.rect(486, 64, 4, 150).fill(0x6a4828)
  winFrame.rect(360, 137, 168, 4).fill(0x6a4828)
  winFrame.roundRect(356, 60, 176, 158, 3).stroke({ width: 7, color: 0x6a4828 })
  winFrame.rect(352, 216, 184, 6).fill(0x573922)
  container.addChild(winFrame)

  // Cork board with notes + string
  const board = new Graphics()
  shadedBox(board, 556, 84, 110, 92, 0xb5894a, { radius: 3 })
  board.moveTo(566, 96).lineTo(656, 110).stroke({ width: 1, color: 0x6a4827 })
  board.roundRect(568, 98, 30, 30, 1).fill(0xf4e3a1)
  board.roundRect(614, 94, 30, 30, 1).fill(0xcfe3a8)
  board.roundRect(590, 130, 30, 30, 1).fill(0xf6c6a6)
  for (const [nx, ny] of [[583, 98], [629, 94], [605, 130]]) board.circle(nx, ny, 2).fill(0xd8402a)
  container.addChild(board)

  // ── Fireplace + flames + strong bloom ──
  const fireplace = new Graphics()
  shadedBox(fireplace, 700, 70, 138, 230, 0x544c49, { radius: 4 })
  fireplace.rect(718, 204, 102, 96).fill(0x140805)
  for (let i = 0; i < 6; i++) fireplace.rect(720 + i * 17, 70, 2, 134).fill({ color: 0x000000, alpha: 0.12 })
  fireplace.roundRect(690, 62, 158, 18, 3).fill(0x7a5230).stroke({ width: 3, color: 0x573922 })
  fireplace.ellipse(720, 62, 6, 4).fill(0xcaa84a)
  fireplace.ellipse(818, 62, 6, 4).fill(0xcaa84a)
  fireplace.roundRect(728, 282, 84, 12, 3).fill(0x4a2f1a) // logs
  fireplace.roundRect(736, 274, 68, 10, 3).fill(0x5a3a22)
  container.addChild(fireplace)
  const fireColors = [0xd83c1e, 0xef6a26, 0xffc24a]
  const fireWidths = [16, 12, 7]
  const fireHeights = [42, 33, 24]
  for (let i = 0; i < 3; i++) {
    const f = new Graphics().ellipse(0, 0, fireWidths[i], fireHeights[i]).fill(fireColors[i])
    f.x = 769
    f.y = 284 - fireHeights[i]
    container.addChild(f)
    flames.push(f)
  }
  const fireGlow = makeGlow(769, 282, 120, 0xff7a2e)
  container.addChild(fireGlow)
  glows.push(fireGlow)

  // Door + mat
  const door = new Graphics()
  shadedBox(door, 858, 96, 80, 204, 0x523218, { radius: 6 })
  door.roundRect(870, 110, 56, 78, 2).fill(shade(0x523218, -0.12)).stroke({ width: 2, color: 0x3a2412 })
  door.roundRect(870, 198, 56, 88, 2).fill(shade(0x523218, -0.12)).stroke({ width: 2, color: 0x3a2412 })
  door.circle(922, 200, 5).fill(0xd4a748)
  door.ellipse(898, 306, 40, 8).fill(0x6a2f3a)
  container.addChild(door)

  // Potted plant (bottom-left corner)
  const plant = new Graphics()
  shadedBox(plant, 84, 500, 34, 40, 0x9c5a3a, { radius: 4 })
  for (const [lx, ly, lw, lh] of [[101, 470, 8, 34], [90, 482, 7, 26], [112, 482, 7, 26], [101, 462, 6, 22]]) {
    plant.ellipse(lx, ly, lw, lh).fill(0x4f7d4a)
  }
  plant.ellipse(101, 470, 8, 34).fill({ color: shade(0x4f7d4a, 0.14), alpha: 0.6 })
  container.addChild(plant)

  // Armchair (shaded) with a resting book
  const chair = new Graphics()
  shadedBox(chair, 142, 430, 100, 64, 0x7a3f3a, { radius: 8 })
  shadedBox(chair, 130, 486, 124, 40, 0x8a4a44, { radius: 4 })
  shadedBox(chair, 116, 470, 22, 56, 0x6e3833, { radius: 6 })
  shadedBox(chair, 246, 470, 22, 56, 0x6e3833, { radius: 6 })
  chair.roundRect(176, 482, 28, 8, 1).fill(0xcaa84a)
  container.addChild(chair)

  // Writing desk + candle + inkwell
  const desk = new Graphics()
  shadedBox(desk, 586, 416, 226, 28, 0x7c5230, { radius: 4 })
  shadedBox(desk, 604, 444, 12, 62, 0x573922, { radius: 2 })
  shadedBox(desk, 782, 444, 12, 62, 0x573922, { radius: 2 })
  desk.roundRect(740, 404, 26, 14, 1).fill(0xefe3c8).stroke({ width: 2, color: 0xb9a878 })
  desk.roundRect(764, 404, 26, 14, 1).fill(0xf3ecd6).stroke({ width: 2, color: 0xb9a878 })
  desk.roundRect(700, 406, 12, 12, 2).fill(0x2d3550) // inkwell
  desk.rect(708, 396, 1.5, 12).fill(0x3a2a1c) // quill nib
  container.addChild(desk)
  const candleGlow = makeGlow(622, 400, 40, 0xffc46a)
  container.addChild(candleGlow)
  glows.push(candleGlow)
  const candleStick = new Graphics()
  candleStick.rect(618, 396, 8, 22).fill(0xf3ead0).stroke({ width: 1, color: 0xcdbf9a })
  candleStick.ellipse(622, 418, 6, 2.5).fill(0xcaa86a)
  container.addChild(candleStick)
  const candleFlame = new Graphics().ellipse(0, 0, 3.3, 6.6).fill(0xffae3c)
  candleFlame.x = 622
  candleFlame.y = 390
  container.addChild(candleFlame)

  // Warm vignette
  const vignette = new Graphics()
  vignette.rect(0, 0, 960, 40).fill({ color: 0x140c06, alpha: 0.32 })
  vignette.rect(0, 560, 960, 40).fill({ color: 0x140c06, alpha: 0.34 })
  vignette.rect(0, 0, 34, 600).fill({ color: 0x140c06, alpha: 0.24 })
  vignette.rect(926, 0, 34, 600).fill({ color: 0x140c06, alpha: 0.24 })
  container.addChild(vignette)

  const { container: moteC, motes } = makeMotes({ x: 60, y: 130, w: 840, h: 430 }, 26, 0xffd9a0)
  container.addChild(moteC)

  return { container, flames, candleFlame, glows, rains, motes }
}
