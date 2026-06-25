/**
 * PixiWorld — the 烛笺阁 front stage rendered with Pixi.js (WebGL canvas).
 *
 * Owns the scene graph (room art + scribes + player + floating prompt), a
 * ticker that integrates movement (reusing sceneConfig collision), DOM input,
 * and room-to-room travel (with a fade transition). React stays out of the
 * per-frame loop: it mounts/destroys this world, toggles `setEnabled` when an
 * overlay opens, and receives `onActivate` for non-travel hotspots.
 *
 * Most rooms are flat side-on; the round table is ISOMETRIC. When the current
 * room has an `iso` config, `this.pos` is a grid coordinate, `this.project`
 * maps it to screen px, movement uses grid speed + a table keep-away, and the
 * player/scribes/prompt live in a depth-sorted entity layer.
 *
 * All input is handled via DOM events + manual hit-testing (no Pixi
 * interaction), so clicks never double-fire between canvas and display objects.
 */

import { Application, Container, Graphics, Text, TextStyle, type Ticker } from 'pixi.js'
import {
  STAGE_W,
  STAGE_H,
  PLAYER_SPEED,
  DEFAULT_ROOM,
  ROOMS,
  isBlocked,
  activeHotspotFor,
  zoneAt,
  type Facing,
  type Hotspot,
  type IsoConfig,
  type RoomDef,
  type Vec,
} from '../sceneConfig'
import { NPCS } from '../npcs'
import { PixiPawn } from './PixiPawn'
import { drawAtrium } from './drawAtrium'
import { drawGuildHall } from './drawGuildHall'
import { drawRoundTableIso } from './drawRoundTableIso'
import { hexNum, type RoomBuild } from './roomBuild'
import { drawShelfBooks, SHELF_ROWS, type ShelfBook, type ShelfSpine } from './shelfBooks'

export interface WorldHandlers {
  /** Player triggered a non-travel hotspot (book / desk / scribe / backstage door). */
  onActivate: (h: Hotspot) => void
  /** Resolve the localized prompt label for a hotspot. */
  label: (h: Hotspot) => string
  /** A specific book spine on the atrium shelf was clicked. */
  onBookClick: (pageId: string) => void
}

const DRAW: Record<string, () => RoomBuild> = {
  atrium: drawAtrium,
  guildhall: drawGuildHall,
}

const ISO_SPEED = 0.07 // grid units / frame
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export class PixiWorld {
  private app = new Application()
  private root = new Container()
  private fadeRect = new Graphics()

  private currentRoom!: RoomDef
  private roomContainer: Container | null = null
  private npcSprites: Array<{ pawn: PixiPawn; at: Vec; facing: Facing }> = []
  private player!: PixiPawn

  // Data-driven atrium shelf
  private shelfLayer: Container | null = null
  private shelfSpines: ShelfSpine[] = []
  private books: ShelfBook[] = []

  // Isometric room (round table): grid-space movement + depth-sorted entities.
  private iso: IsoConfig | null = null
  private isoEnt: Container | null = null
  /** Top layer (above FX) where the prompt is parented in the iso room. */
  private isoUI: Container | null = null
  private project: (x: number, y: number) => Vec = (x, y) => ({ x, y })
  private moveSpeed = PLAYER_SPEED

  private flames: Graphics[] = []
  private candleFlame: Graphics | null = null
  private glows: Container[] = []
  private rains: RoomBuild['rains'] = []
  private motes: RoomBuild['motes'] = []

  // Prompt
  private promptC = new Container()
  private promptBg = new Graphics()
  private promptKey = new Graphics()
  private promptKeyText!: Text
  private promptLabel!: Text
  /** Logical-px centre of the live prompt (for click hit-testing). */
  private promptLogical: Vec | null = null

  // Movement state
  private keys = new Set<string>()
  private target: Vec | null = null
  private onArrive: (() => void) | null = null
  private pos: Vec = { x: 0, y: 0 }
  private facing: Facing = 'down'
  private moving = false

  // Room transition
  private fade = 0
  private fadeDir = 0
  private pending: { roomId: string; arrive?: Vec } | null = null

  private enabled = true
  private scale = 1
  private time = 0
  private active: Hotspot | null = null

  private inited = false
  private destroyed = false

  constructor(private container: HTMLElement, private handlers: WorldHandlers) {}

  private get frozen() {
    return !this.enabled || this.fadeDir !== 0
  }

  private get isIso() {
    return this.iso !== null
  }

  async init() {
    await this.app.init({
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    })
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true })
      return
    }

    this.app.canvas.classList.add('fs-canvas')
    this.container.appendChild(this.app.canvas)
    this.app.stage.addChild(this.root)

    this.fadeRect.rect(-200, -200, 5000, 5000).fill(0x140c06)
    this.fadeRect.alpha = 0
    this.app.stage.addChild(this.fadeRect)

    this.buildPrompt()
    this.loadRoom(DEFAULT_ROOM)

    this.resize()
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.app.canvas.addEventListener('pointerdown', this.onPointer)
    this.app.ticker.add(this.update)

    this.inited = true
  }

  destroy() {
    this.destroyed = true
    if (!this.inited) return
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.app.canvas.removeEventListener('pointerdown', this.onPointer)
    this.app.destroy({ removeView: true }, { children: true })
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) {
      this.keys.clear()
      this.target = null
      this.onArrive = null
      this.moving = false
    }
  }

  // ── Room loading ──
  private loadRoom(roomId: string, spawn?: Vec) {
    // Teardown — detach the reusable prompt FIRST so destroying the room (which
    // may parent the prompt in the iso entity layer) never frees it.
    if (this.promptC.parent) this.promptC.parent.removeChild(this.promptC)
    this.npcSprites.forEach((s) => s.pawn.destroy())
    this.npcSprites = []
    if (this.player) this.player.destroy()
    this.isoEnt = null
    this.isoUI = null
    if (this.shelfLayer) {
      this.shelfLayer.destroy({ children: true })
      this.shelfLayer = null
    }
    this.shelfSpines = []
    if (this.roomContainer) {
      this.roomContainer.destroy({ children: true })
      this.roomContainer = null
    }

    const def = ROOMS[roomId]
    this.currentRoom = def
    this.iso = def.iso ?? null
    this.moveSpeed = def.iso ? ISO_SPEED : PLAYER_SPEED

    if (def.iso) {
      const ic = def.iso
      this.project = (gx, gy) => ({ x: (gx - gy) * ic.hw, y: (gx + gy) * ic.hh })
      const build = drawRoundTableIso(ic)
      this.roomContainer = build.container
      this.roomContainer.position.set(ic.ox, ic.oy)
      this.isoEnt = build.ent
      this.isoUI = build.ui
      this.glows = build.glows
      this.motes = build.motes
      this.flames = []
      this.candleFlame = null
      this.rains = []
    } else {
      this.project = (x, y) => ({ x, y })
      const build = DRAW[roomId]()
      this.roomContainer = build.container
      this.roomContainer.position.set(0, 0)
      this.flames = build.flames
      this.candleFlame = build.candleFlame
      this.glows = build.glows
      this.rains = build.rains
      this.motes = build.motes
    }
    this.root.addChild(this.roomContainer)

    // Shelf layer (only the atrium fills it) sits above the room art.
    this.shelfLayer = new Container()
    this.root.addChild(this.shelfLayer)

    // Entities live in the iso sortable layer, or directly in root for flat rooms.
    const parent = this.isoEnt ?? this.root

    for (const p of def.npcs) {
      const d = NPCS[p.id]
      if (!d) continue
      const pawn = new PixiPawn({ hair: hexNum(d.hair), tunic: hexNum(d.accent) }, d.name)
      const sp = this.project(p.at.x, p.at.y)
      pawn.setPose(sp.x, sp.y, p.facing, false, 0)
      if (this.isoEnt) pawn.zIndex = Math.round(sp.y)
      parent.addChild(pawn)
      this.npcSprites.push({ pawn, at: p.at, facing: p.facing })
    }

    this.player = new PixiPawn({ tunic: 0xc0502f, hair: 0x35506e })
    parent.addChild(this.player)
    // The prompt sits above the FX wash/glows: a top UI layer in iso, root in flat.
    ;(this.isoUI ?? this.root).addChild(this.promptC)

    this.pos = spawn ? { ...spawn } : { ...def.spawn }
    if (this.isoEnt) {
      const sp = this.project(this.pos.x, this.pos.y)
      this.player.zIndex = Math.round(sp.y)
    }
    this.facing = 'down'
    this.moving = false
    this.target = null
    this.onArrive = null
    this.keys.clear()
    this.active = null
    this.promptLogical = null
    this.promptC.visible = false
    this.fillShelf()
  }

  /** Replace the shelf books; rebuilds the atrium shelf if it is current. */
  setBooks(books: ShelfBook[]) {
    this.books = books
    if (this.inited) this.fillShelf()
  }

  private fillShelf() {
    if (!this.shelfLayer) return
    this.shelfLayer.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.shelfSpines = []
    if (!this.currentRoom || this.currentRoom.id !== 'atrium') return
    const { container, spines } = drawShelfBooks(this.books, SHELF_ROWS)
    this.shelfLayer.addChild(container)
    this.shelfSpines = spines
  }

  private travel(roomId: string, arrive?: Vec) {
    if (this.fadeDir !== 0 || !ROOMS[roomId]) return
    this.pending = { roomId, arrive }
    this.fadeDir = 1
  }

  private activate(h: Hotspot) {
    if (h.kind === 'travel' && h.target) {
      this.travel(h.target, h.arrive)
      return
    }
    this.handlers.onActivate(h)
  }

  // ── Prompt ──
  private buildPrompt() {
    this.promptKeyText = new Text({
      text: 'E',
      style: new TextStyle({ fontFamily: '"Pixelify Sans", monospace', fontSize: 13, fill: 0x2a1c12 }),
    })
    this.promptKeyText.anchor.set(0.5)
    this.promptLabel = new Text({
      text: '',
      style: new TextStyle({ fontFamily: '"Pixelify Sans", system-ui, sans-serif', fontSize: 14, fill: 0xfbe7c2 }),
    })
    this.promptLabel.anchor.set(0, 0.5)
    this.promptC.addChild(this.promptBg, this.promptKey, this.promptKeyText, this.promptLabel)
    this.promptC.visible = false
  }

  private layoutPrompt(label: string) {
    this.promptLabel.text = label
    const keyW = 18
    const gap = 7
    const padX = 9
    const h = 24
    const contentW = keyW + gap + this.promptLabel.width
    const totalW = contentW + padX * 2
    const kx = -totalW / 2 + padX

    this.promptBg.clear()
      .roundRect(-totalW / 2, -h / 2, totalW, h, 5)
      .fill({ color: 0x1c120a, alpha: 0.92 })
      .stroke({ width: 2, color: 0xd4a748 })
    this.promptKey.clear().roundRect(kx, -9, keyW, 18, 3).fill(0xd4a748)
    this.promptKeyText.x = kx + keyW / 2
    this.promptKeyText.y = 0
    this.promptLabel.x = kx + keyW + gap
    this.promptLabel.y = 0
  }

  // ── Sizing ──
  private resize = () => {
    const s = Math.min((window.innerWidth - 48) / STAGE_W, (window.innerHeight - 132) / STAGE_H)
    this.scale = clamp(s, 0.45, 2)
    this.app.renderer.resize(STAGE_W * this.scale, STAGE_H * this.scale)
    this.root.scale.set(this.scale)
  }

  // ── Input ──
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.frozen) return
    const k = e.key.toLowerCase()
    if (k === 'e') {
      if (this.active) {
        e.preventDefault()
        this.activate(this.active)
      }
      return
    }
    if (MOVE_KEYS.has(k)) {
      e.preventDefault()
      this.keys.add(k)
      this.target = null
      this.onArrive = null
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (MOVE_KEYS.has(k)) this.keys.delete(k)
  }

  private onPointer = (e: PointerEvent) => {
    if (this.frozen) return
    const rect = this.app.canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / this.scale
    const y = (e.clientY - rect.top) / this.scale
    // Click the floating prompt → activate.
    if (
      this.active &&
      this.promptLogical &&
      Math.abs(x - this.promptLogical.x) <= 72 &&
      Math.abs(y - this.promptLogical.y) <= 22
    ) {
      this.activate(this.active)
      return
    }
    // Click a specific book spine on the atrium shelf.
    for (const s of this.shelfSpines) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
        this.handlers.onBookClick(s.pageId)
        return
      }
    }
    if (this.isIso && this.iso) {
      // Inverse-project the click to a grid tile and walk there.
      const a = (x - this.iso.ox) / this.iso.hw
      const bb = (y - this.iso.oy) / this.iso.hh
      const b = this.currentRoom.bounds
      this.moveTo({
        x: clamp((a + bb) / 2, b.minX, b.maxX),
        y: clamp((bb - a) / 2, b.minY, b.maxY),
      })
      return
    }
    const z = zoneAt(this.currentRoom, x, y)
    if (z) {
      this.moveTo(z.stand, () => this.activate(z))
      return
    }
    this.moveTo({ x, y })
  }

  private moveTo(t: Vec, cb?: () => void) {
    if (this.frozen) return
    this.keys.clear()
    this.target = { x: t.x, y: t.y }
    this.onArrive = cb ?? null
  }

  // ── Movement integration ──
  private integrate(dt: number) {
    const b = this.currentRoom.bounds
    let vx = 0
    let vy = 0
    if (this.keys.size) {
      const up = this.keys.has('w') || this.keys.has('arrowup')
      const down = this.keys.has('s') || this.keys.has('arrowdown')
      const left = this.keys.has('a') || this.keys.has('arrowleft')
      const right = this.keys.has('d') || this.keys.has('arrowright')
      if (this.isIso) {
        // Grid deltas chosen so the motion reads as screen up/down/left/right.
        if (up) { vx -= 1; vy -= 1 }
        if (down) { vx += 1; vy += 1 }
        if (left) { vx -= 1; vy += 1 }
        if (right) { vx += 1; vy -= 1 }
      } else {
        if (left) vx -= 1
        if (right) vx += 1
        if (up) vy -= 1
        if (down) vy += 1
      }
    } else if (this.target) {
      const dx = this.target.x - this.pos.x
      const dy = this.target.y - this.pos.y
      const dist = Math.hypot(dx, dy)
      if (dist <= this.moveSpeed * dt) {
        this.pos = { x: this.target.x, y: this.target.y }
        this.target = null
        const cb = this.onArrive
        this.onArrive = null
        this.moving = false
        if (cb) cb()
        return
      }
      vx = dx / dist
      vy = dy / dist
    }

    if (vx === 0 && vy === 0) {
      this.moving = false
      return
    }

    const len = Math.hypot(vx, vy) || 1
    vx = (vx / len) * this.moveSpeed * dt
    vy = (vy / len) * this.moveSpeed * dt

    if (this.isIso && this.iso) {
      const t = this.iso.table
      const keepR = this.iso.keepR
      let nx = this.pos.x + vx
      let ny = this.pos.y + vy
      // Keep clear of the round table. If the straight step would enter the ring,
      // slide along the tangent (orbit) toward the target instead of pushing
      // straight out — a radial-only push nets zero motion and would deadlock.
      if (Math.hypot(nx - t.x, ny - t.y) < keepR) {
        const rx = this.pos.x - t.x
        const ry = this.pos.y - t.y
        const rlen = Math.hypot(rx, ry) || 1
        const tanx = -ry / rlen
        const tany = rx / rlen
        const sign = vx * tanx + vy * tany >= 0 ? 1 : -1
        const vmag = Math.hypot(vx, vy)
        nx = this.pos.x + tanx * sign * vmag
        ny = this.pos.y + tany * sign * vmag
        // Snap back onto the keep-ring so we orbit at constant radius.
        const ex = nx - t.x
        const ey = ny - t.y
        const elen = Math.hypot(ex, ey) || 1
        nx = t.x + (ex / elen) * keepR
        ny = t.y + (ey / elen) * keepR
      }
      nx = clamp(nx, b.minX, b.maxX)
      ny = clamp(ny, b.minY, b.maxY)
      // Facing follows the projected screen velocity (faces stay toward camera).
      const s0 = this.project(this.pos.x, this.pos.y)
      const s1 = this.project(nx, ny)
      const svx = s1.x - s0.x
      this.facing = Math.abs(svx) < 0.4 ? 'down' : svx < 0 ? 'left' : 'right'
      if (nx !== this.pos.x || ny !== this.pos.y) {
        this.pos = { x: nx, y: ny }
        this.moving = true
      } else {
        this.moving = false
        if (this.target) {
          this.target = null
          this.onArrive = null
        }
      }
      return
    }

    // Flat: per-axis AABB collision (slides along walls).
    const px = this.pos.x
    const py = this.pos.y
    let nx = px
    let ny = py
    if (!isBlocked(this.currentRoom, px + vx, py)) nx = px + vx
    if (!isBlocked(this.currentRoom, nx, py + vy)) ny = py + vy
    this.facing = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down'
    if (nx !== px || ny !== py) {
      this.pos = { x: nx, y: ny }
      this.moving = true
    } else {
      this.moving = false
      if (this.target) {
        this.target = null
        this.onArrive = null
      }
    }
  }

  // ── Per-frame ──
  private update = (ticker: Ticker) => {
    this.time += ticker.deltaMS / 1000
    const dt = Math.min(ticker.deltaTime, 3)

    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * (ticker.deltaMS / 1000) * 5.5
      if (this.fadeDir > 0 && this.fade >= 1) {
        this.fade = 1
        if (this.pending) {
          this.loadRoom(this.pending.roomId, this.pending.arrive)
          this.pending = null
        }
        this.fadeDir = -1
      } else if (this.fadeDir < 0 && this.fade <= 0) {
        this.fade = 0
        this.fadeDir = 0
      }
      this.fadeRect.alpha = this.fade
    }

    if (!this.frozen) this.integrate(dt)
    const ps = this.project(this.pos.x, this.pos.y)
    this.player.setPose(ps.x, ps.y, this.facing, this.moving, this.time)
    if (this.isoEnt) this.player.zIndex = Math.round(ps.y)

    for (let i = 0; i < this.flames.length; i++) {
      this.flames[i].scale.set(1, 0.86 + 0.16 * Math.sin(this.time * 9 + i * 1.7))
    }
    if (this.candleFlame) this.candleFlame.scale.set(1, 0.8 + 0.22 * Math.sin(this.time * 11))
    for (let i = 0; i < this.glows.length; i++) {
      this.glows[i].alpha = 0.46 + 0.18 * Math.sin(this.time * 2.2 + i)
    }
    for (const r of this.rains) {
      const span = r.botY - r.topY
      r.g.y = r.topY + ((this.time * r.speed + r.phase) % span)
    }
    for (const m of this.motes) {
      const tt = this.time * m.speed + m.phase
      m.g.x = m.x0 + Math.sin(tt) * m.ampX
      const up = (this.time * m.rise + m.phase * 20) % (m.span + 40)
      m.g.y = m.y0 + 20 - up
      m.g.alpha = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(tt * 1.7))
    }
    for (const s of this.npcSprites) {
      const p = this.project(s.at.x, s.at.y)
      s.pawn.setPose(p.x, p.y, s.facing, false, this.time)
    }

    const active = this.frozen ? null : activeHotspotFor(this.currentRoom, this.pos)
    if (active !== this.active) {
      this.active = active
      if (active) this.layoutPrompt(this.handlers.label(active))
    }
    if (active) {
      this.promptC.visible = true
      const bob = Math.sin(this.time * 3) * -4
      if (this.isIso && this.iso) {
        const pp = this.project(active.prompt.x, active.prompt.y)
        const lift = 92
        this.promptC.x = pp.x
        this.promptC.y = pp.y - lift + bob
        this.promptLogical = { x: this.iso.ox + pp.x, y: this.iso.oy + pp.y - lift }
      } else {
        this.promptC.x = active.prompt.x
        this.promptC.y = active.prompt.y + bob
        this.promptLogical = { x: active.prompt.x, y: active.prompt.y }
      }
    } else {
      this.promptC.visible = false
      this.promptLogical = null
    }
  }
}
