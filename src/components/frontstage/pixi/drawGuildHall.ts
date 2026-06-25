/**
 * drawGuildHall — 工位廊 / The Guild Hall. A long room with one workstation per
 * scribe (a desk + a sign in the scribe's accent colour naming its craft) plus
 * a door back to the atrium. Workstation x-positions are read from the room
 * data so the signs line up with the NPC sprites the world places on top.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { makeGlow, lightPool, plankFloor, shadedBox, makeMotes, shade, hexNum, PALETTE, nightWash, type RoomBuild } from './roomBuild'
import { ROOMS } from '../sceneConfig'
import { NPCS } from '../npcs'

export function drawGuildHall(): RoomBuild {
  const container = new Container()
  const glows: Graphics[] = []

  // ── Shell (warm candlelit wood — shared palette with the atrium) ──
  const shell = new Graphics()
  shell.rect(0, 0, 960, 300).fill(PALETTE.wall)
  for (let x = 0; x < 960; x += 40) shell.rect(x + 38, 0, 2, 256).fill(PALETTE.wallSeam)
  shell.rect(0, 256, 960, 44).fill(PALETTE.wainscot)
  shell.rect(0, 256, 960, 3).fill(shade(PALETTE.wainscot, 0.14))
  shell.rect(0, 296, 960, 4).fill(PALETTE.baseboard)
  for (let x = 24; x < 960; x += 96) {
    shell.roundRect(x, 244, 72, 46, 3).fill(shade(PALETTE.wainscot, -0.08)).stroke({ width: 2, color: shade(PALETTE.wainscot, 0.12) })
  }
  container.addChild(shell)
  const floor = new Graphics()
  plankFloor(floor, { x: 0, y: 300, w: 960, h: 300 }, PALETTE.floor, 58)
  container.addChild(floor)

  // Central runner rug
  const rug = new Graphics()
  rug.rect(70, 470, 820, 70).fill(PALETTE.rug)
  rug.rect(70, 470, 820, 70).stroke({ width: 5, color: PALETTE.rugTrim })
  rug.rect(78, 478, 804, 4).fill(PALETTE.rugTrim)
  rug.rect(78, 528, 804, 4).fill(PALETTE.rugTrim)
  container.addChild(rug)

  // Return door (left wall)
  const door = new Graphics()
  door.roundRect(0, 110, 64, 190, 6).fill(0x523218).stroke({ width: 5, color: 0x3a2412 })
  door.roundRect(10, 124, 44, 70, 2).fill(0x5a3a1e).stroke({ width: 2, color: 0x3a2412 })
  door.roundRect(10, 202, 44, 84, 2).fill(0x5a3a1e).stroke({ width: 2, color: 0x3a2412 })
  door.circle(48, 204, 5).fill(0xd4a748)
  container.addChild(door)
  const archGlow = makeGlow(32, 200, 60, 0xffd089)
  container.addChild(archGlow)
  glows.push(archGlow)

  // Right door (to the Round Table)
  const rdoor = new Graphics()
  rdoor.roundRect(896, 110, 64, 190, 6).fill(0x523218).stroke({ width: 5, color: 0x3a2412 })
  rdoor.roundRect(906, 124, 44, 70, 2).fill(0x5a3a1e).stroke({ width: 2, color: 0x3a2412 })
  rdoor.roundRect(906, 202, 44, 84, 2).fill(0x5a3a1e).stroke({ width: 2, color: 0x3a2412 })
  rdoor.circle(912, 204, 5).fill(0xd4a748)
  container.addChild(rdoor)
  const rGlow = makeGlow(928, 200, 60, 0xffd089)
  container.addChild(rGlow)
  glows.push(rGlow)

  // ── Workstations (one per scribe) ──
  for (const p of ROOMS.guildhall.npcs) {
    const x = p.at.x
    const def = NPCS[p.id]
    if (!def) continue
    const accent = hexNum(def.accent)

    container.addChild(lightPool(x, 360, 42, 24, 0xffcaa0, 0.1))
    const ws = new Graphics()
    shadedBox(ws, x - 34, 330, 68, 18, 0x6a4a2c, { radius: 3 })
    ws.rect(x - 30, 348, 6, 18).fill(0x47301a)
    ws.rect(x + 24, 348, 6, 18).fill(0x47301a)
    // sign post + accent plaque (raised so it clears the scribe's name tag)
    ws.rect(x - 2, 256, 4, 74).fill(0x47301a)
    ws.roundRect(x - 30, 236, 60, 20, 3).fill(accent).stroke({ width: 2, color: shade(accent, -0.4) })
    container.addChild(ws)

    const label = new Text({
      text: def.ability,
      style: new TextStyle({ fontFamily: '"Pixelify Sans", system-ui, sans-serif', fontSize: 10, fill: 0xfff4ea }),
    })
    label.anchor.set(0.5)
    label.x = x
    label.y = 246
    container.addChild(label)

    // warm desk lamp glow
    const glow = makeGlow(x, 320, 44, 0xffcaa0)
    container.addChild(glow)
    glows.push(glow)
  }

  // Banner over the hall
  const banner = new Text({
    text: '阁中诸贤 · The Scribes',
    style: new TextStyle({ fontFamily: '"Pixelify Sans", system-ui, sans-serif', fontSize: 20, fill: 0xd9c39a }),
  })
  banner.anchor.set(0.5, 0)
  banner.x = 480
  banner.y = 24
  container.addChild(banner)

  // Cool moonlight wash (shared across all rooms — ties them to one night)
  container.addChild(nightWash({ x: 0, y: 0, w: 960, h: 600 }, 0.14))

  // Vignette
  const vignette = new Graphics()
  vignette.rect(0, 0, 960, 30).fill({ color: PALETTE.vignette, alpha: 0.3 })
  vignette.rect(0, 566, 960, 34).fill({ color: PALETTE.vignette, alpha: 0.32 })
  vignette.rect(0, 0, 26, 600).fill({ color: PALETTE.vignette, alpha: 0.24 })
  vignette.rect(934, 0, 26, 600).fill({ color: PALETTE.vignette, alpha: 0.24 })
  container.addChild(vignette)

  const { container: moteC, motes } = makeMotes({ x: 60, y: 120, w: 840, h: 440 }, 22, PALETTE.mote)
  container.addChild(moteC)

  return { container, flames: [], candleFlame: null, glows, rains: [], motes }
}
