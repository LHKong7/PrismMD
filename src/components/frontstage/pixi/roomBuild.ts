/**
 * roomBuild.ts — shared types + an "art kit" for drawing rooms with Pixi
 * Graphics: colour shading (lighten/darken), shaded furniture boxes, soft
 * elliptical light pools, glows, and drifting ambient motes. Each draw*
 * function returns a RoomBuild: the art container plus the animated bits
 * (flames / candle / glows / rain / motes) the world's ticker drives.
 */

import { Container, Graphics } from 'pixi.js'

export interface RainDrop {
  g: Graphics
  speed: number
  phase: number
  topY: number
  botY: number
  x: number
}

export interface Mote {
  /** A Graphics or Sprite — only x/y/alpha are driven by the ticker. */
  g: Container
  x0: number
  y0: number
  ampX: number
  span: number
  speed: number
  rise: number
  phase: number
}

export interface RoomBuild {
  container: Container
  flames: Graphics[]
  candleFlame: Graphics | null
  /** Display objects whose alpha the ticker pulses (Graphics or additive glows). */
  glows: Container[]
  rains: RainDrop[]
  motes: Mote[]
}

export interface Area {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Shared 烛笺阁 palette — every room is the same building on the same night:
 * warm candlelit wood, amber light, deep-brown shadows, with a faint cool
 * moonlight wash over the top. All three scenes pull their base tones from here
 * (and apply `nightWash`) so they read as one place rather than three.
 */
export const PALETTE = {
  wall: 0x2f231b,
  wallSeam: 0x281d16,
  wainscot: 0x4a3527,
  floor: 0x5e3e25,
  baseboard: 0x2e2014,
  rug: 0x8a3a32,
  rugTrim: 0xc49a5a,
  amber: 0xffc46a,
  amberSoft: 0xffcaa0,
  mote: 0xffd9a0,
  vignette: 0x140c06,
  night: 0x1b2f55,
}

/** Cool moonlight wash — the shared atmospheric overlay tying every room to night. */
export function nightWash(area: Area, alpha: number): Graphics {
  return new Graphics().rect(area.x, area.y, area.w, area.h).fill({ color: PALETTE.night, alpha })
}

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

/** Lighten/darken a 0xRRGGBB colour by `amt` (−1..1). */
export function shade(hex: number, amt: number): number {
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  const d = amt * 255
  return (clamp8(r + d) << 16) | (clamp8(g + d) << 8) | clamp8(b + d)
}

/** CSS-style "#rrggbb" → 0xRRGGBB number for Pixi fills. */
export function hexNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

/** Soft glow = concentric rings (fake radial falloff); ticker pulses its alpha. */
export function makeGlow(cx: number, cy: number, r: number, color: number): Graphics {
  const g = new Graphics()
  g.circle(cx, cy, r).fill({ color, alpha: 0.1 })
  g.circle(cx, cy, r * 0.66).fill({ color, alpha: 0.12 })
  g.circle(cx, cy, r * 0.36).fill({ color, alpha: 0.16 })
  return g
}

/**
 * Additive bloom glow — concentric rings with `blendMode: 'add'`, so it brightens
 * whatever is beneath it (lamps, candles, the round table). The ticker pulses its
 * overall alpha. Brighter and softer than `makeGlow`; used by the isometric room.
 */
export function makeGlowAdd(cx: number, cy: number, r: number, color: number): Graphics {
  const g = new Graphics()
  g.circle(cx, cy, r).fill({ color, alpha: 0.028 })
  g.circle(cx, cy, r * 0.6).fill({ color, alpha: 0.04 })
  g.circle(cx, cy, r * 0.3).fill({ color, alpha: 0.055 })
  g.blendMode = 'add'
  return g
}

/** Soft elliptical light pool (e.g. lamplight on a floor). */
export function lightPool(cx: number, cy: number, rx: number, ry: number, color: number, a = 0.14): Graphics {
  const g = new Graphics()
  g.ellipse(cx, cy, rx, ry).fill({ color, alpha: a })
  g.ellipse(cx, cy, rx * 0.62, ry * 0.62).fill({ color, alpha: a })
  return g
}

interface BoxOpts {
  top?: number
  bottom?: number
  outline?: number
  radius?: number
}

/** A furniture box with a top highlight, bottom shadow and dark outline. */
export function shadedBox(g: Graphics, x: number, y: number, w: number, h: number, base: number, opt: BoxOpts = {}): Graphics {
  const top = opt.top ?? shade(base, 0.16)
  const bottom = opt.bottom ?? shade(base, -0.2)
  const outline = opt.outline ?? shade(base, -0.42)
  const band = Math.max(2, Math.round(h * 0.22))
  const rad = opt.radius ?? 3
  g.roundRect(x, y, w, h, rad).fill(base)
  g.rect(x + 1, y + 1, w - 2, band).fill(top)
  g.rect(x + 1, y + h - band - 1, w - 2, band).fill(bottom)
  g.roundRect(x, y, w, h, rad).stroke({ width: 2, color: outline })
  return g
}

/** Wood-plank floor with subtle per-plank shading. */
export function plankFloor(g: Graphics, area: Area, base: number, plankW = 56): Graphics {
  g.rect(area.x, area.y, area.w, area.h).fill(base)
  let i = 0
  for (let x = area.x; x < area.x + area.w; x += plankW) {
    const tint = i % 2 === 0 ? shade(base, 0.04) : shade(base, -0.05)
    g.rect(x, area.y, plankW - 3, area.h).fill(tint)
    g.rect(x + plankW - 3, area.y, 3, area.h).fill(shade(base, -0.22))
    i++
  }
  return g
}

/** Drifting ambient motes (dust / embers) that the ticker animates upward. */
export function makeMotes(area: Area, count: number, color: number): { container: Container; motes: Mote[] } {
  const container = new Container()
  const motes: Mote[] = []
  for (let i = 0; i < count; i++) {
    const r = 0.7 + Math.random() * 1.7
    const x0 = area.x + Math.random() * area.w
    const y0 = area.y + Math.random() * area.h
    const dot = new Graphics().circle(0, 0, r).fill({ color, alpha: 0.6 })
    dot.x = x0
    dot.y = y0
    container.addChild(dot)
    motes.push({
      g: dot,
      x0,
      y0,
      ampX: 5 + Math.random() * 11,
      span: area.h,
      speed: 0.25 + Math.random() * 0.5,
      rise: 5 + Math.random() * 11,
      phase: Math.random() * Math.PI * 2,
    })
  }
  return { container, motes }
}

/** Additive (glowing) drifting motes — soft embers/dust for the isometric room. */
export function makeMotesAdd(area: Area, count: number, color: number): { container: Container; motes: Mote[] } {
  const container = new Container()
  const motes: Mote[] = []
  for (let i = 0; i < count; i++) {
    const r = 1.6 + Math.random() * 2.4
    const x0 = area.x + Math.random() * area.w
    const y0 = area.y + Math.random() * area.h
    const dot = new Graphics()
    dot.circle(0, 0, r).fill({ color, alpha: 0.3 })
    dot.circle(0, 0, r * 0.5).fill({ color, alpha: 0.3 })
    dot.blendMode = 'add'
    dot.x = x0
    dot.y = y0
    container.addChild(dot)
    motes.push({
      g: dot,
      x0,
      y0,
      ampX: 5 + Math.random() * 11,
      span: area.h,
      speed: 0.25 + Math.random() * 0.5,
      rise: 5 + Math.random() * 11,
      phase: Math.random() * Math.PI * 2,
    })
  }
  return { container, motes }
}
