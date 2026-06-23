/**
 * drawRoundTable — 圆桌厅 / The Round Table. A warm meeting room with a big oval
 * table (the interactable), empty chairs on the near side, a chandelier glow,
 * and a door back to the Guild Hall. The invited scribes are placed around the
 * far rim by the world (decorative).
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { makeGlow, lightPool, plankFloor, shadedBox, makeMotes, shade, type RoomBuild } from './roomBuild'

export function drawRoundTable(): RoomBuild {
  const container = new Container()
  const glows: Graphics[] = []

  // ── Shell ──
  const shell = new Graphics()
  shell.rect(0, 0, 960, 300).fill(0x33261d)
  for (let x = 0; x < 960; x += 40) shell.rect(x + 38, 0, 2, 256).fill(0x2a1f17)
  shell.rect(0, 256, 960, 44).fill(0x4a3527)
  shell.rect(0, 256, 960, 3).fill(0x5a4029)
  shell.rect(0, 296, 960, 4).fill(0x2e2014)
  for (let x = 24; x < 960; x += 96) {
    shell.roundRect(x, 244, 72, 46, 3).fill(shade(0x4a3527, -0.08)).stroke({ width: 2, color: shade(0x4a3527, 0.12) })
  }
  container.addChild(shell)
  const floor = new Graphics()
  plankFloor(floor, { x: 0, y: 300, w: 960, h: 300 }, 0x5e3e25, 58)
  container.addChild(floor)
  container.addChild(lightPool(480, 372, 150, 80, 0xffcf8a, 0.1))

  // Round rug under the table
  const rug = new Graphics()
  rug.ellipse(480, 410, 250, 130).fill(0x6a2f3a)
  rug.ellipse(480, 410, 250, 130).stroke({ width: 6, color: 0xc49a5a })
  rug.ellipse(480, 410, 210, 108).stroke({ width: 2, color: 0xc49a5a })
  container.addChild(rug)

  // Chandelier glow + fixture
  const chand = makeGlow(480, 250, 150, 0xffcf8a)
  container.addChild(chand)
  glows.push(chand)
  const fixture = new Graphics()
  fixture.rect(478, 0, 4, 70).fill(0x3a2a1c)
  fixture.roundRect(440, 64, 80, 12, 4).fill(0x6a4a2c).stroke({ width: 2, color: 0x3a2412 })
  for (const lx of [452, 480, 508]) {
    fixture.rect(lx - 1, 70, 2, 8).fill(0x3a2a1c)
    fixture.circle(lx, 82, 4).fill(0xffd27a)
  }
  container.addChild(fixture)

  // Empty chairs on the near side (the reader's seat)
  const chairs = new Graphics()
  for (const cx of [392, 568]) {
    chairs.roundRect(cx - 22, 446, 44, 14, 4).fill(0x6e3833).stroke({ width: 3, color: 0x4a2420 })
    chairs.roundRect(cx - 22, 452, 44, 40, 4).fill(0x7a3f3a).stroke({ width: 3, color: 0x4a2420 })
  }
  container.addChild(chairs)

  // The oval table
  const table = new Graphics()
  table.ellipse(480, 378, 134, 66).fill(0x2e1d10)
  table.ellipse(480, 372, 130, 62).fill(0x7c5230)
  table.ellipse(480, 372, 130, 62).stroke({ width: 4, color: 0x5a3c22 })
  table.ellipse(480, 370, 110, 50).fill(0x8a6038)
  table.ellipse(480, 366, 96, 38).fill(shade(0x8a6038, 0.12))
  // scattered papers + a quill
  table.rect(430, 356, 30, 22).fill(0xefe3c8).stroke({ width: 2, color: 0xc9b88a })
  table.rect(500, 362, 30, 22).fill(0xefe3c8).stroke({ width: 2, color: 0xc9b88a })
  table.rect(466, 380, 28, 18).fill(0xf3ecd6).stroke({ width: 2, color: 0xc9b88a })
  table.rect(540, 352, 4, 22).fill(0x3a2a1c)
  container.addChild(table)

  // Door back to the Guild Hall (left)
  const door = new Graphics()
  door.roundRect(0, 110, 64, 190, 6).fill(0x523218).stroke({ width: 5, color: 0x3a2412 })
  door.roundRect(10, 124, 44, 70, 2).fill(0x5a3a1e).stroke({ width: 2, color: 0x3a2412 })
  door.roundRect(10, 202, 44, 84, 2).fill(0x5a3a1e).stroke({ width: 2, color: 0x3a2412 })
  door.circle(48, 204, 5).fill(0xd4a748)
  container.addChild(door)
  const archGlow = makeGlow(32, 200, 60, 0xffd089)
  container.addChild(archGlow)
  glows.push(archGlow)

  // Filing cabinet (the Archive) — back-right
  const cabinet = new Graphics()
  shadedBox(cabinet, 812, 120, 96, 180, 0x5a3c22, { radius: 4 })
  for (let i = 0; i < 4; i++) {
    const dy = 130 + i * 42
    cabinet.roundRect(820, dy, 80, 34, 3).fill(0x6a4828).stroke({ width: 2, color: 0x3a2614 })
    cabinet.roundRect(852, dy + 13, 16, 6, 2).fill(0xd4a748)
  }
  container.addChild(cabinet)
  const cabGlow = makeGlow(860, 150, 50, 0xffcaa0)
  container.addChild(cabGlow)
  glows.push(cabGlow)

  // Banner
  const banner = new Text({
    text: '写作圆桌 · The Round Table',
    style: new TextStyle({ fontFamily: '"Pixelify Sans", system-ui, sans-serif', fontSize: 20, fill: 0xe8c98a }),
  })
  banner.anchor.set(0.5, 0)
  banner.x = 480
  banner.y = 20
  container.addChild(banner)

  // Vignette
  const vignette = new Graphics()
  vignette.rect(0, 0, 960, 30).fill({ color: 0x140c06, alpha: 0.3 })
  vignette.rect(0, 566, 960, 34).fill({ color: 0x140c06, alpha: 0.32 })
  vignette.rect(0, 0, 26, 600).fill({ color: 0x140c06, alpha: 0.24 })
  vignette.rect(934, 0, 26, 600).fill({ color: 0x140c06, alpha: 0.24 })
  container.addChild(vignette)

  const { container: moteC, motes } = makeMotes({ x: 60, y: 120, w: 840, h: 440 }, 22, 0xffd9a0)
  container.addChild(moteC)

  return { container, flames: [], candleFlame: null, glows, rains: [], motes }
}
