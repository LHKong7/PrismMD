/**
 * sceneConfig.ts — rooms of 烛笺阁 / Inkwell Keep.
 *
 * The world is a set of fixed-size pixel rooms (logical 960×600). Each RoomDef
 * carries its walkable bounds, obstacle AABBs, hotspots, standing NPCs and a
 * spawn point. The player's FEET anchor moves inside `bounds` minus
 * `obstacles`. Hotspots are floor stand-points; walking within `radius` arms
 * the prompt, and pressing E (or clicking the furniture `zone`) activates it.
 *
 * `travel` hotspots switch rooms (Pixi handles the transition); other kinds
 * bubble to React (open an overlay / exit to backstage). All coordinates are
 * logical world pixels; the whole stage is scaled to fit by FrontStageView.
 */

export interface Vec {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Facing = 'up' | 'down' | 'left' | 'right'

export type HotspotKind = 'stacks' | 'desk' | 'door' | 'npc' | 'travel' | 'roundtable' | 'archive' | 'muse'

export interface Hotspot {
  id: string
  kind: HotspotKind
  /** NPC id when kind === 'npc'. */
  npcId?: string
  /** Target room id when kind === 'travel'. */
  target?: string
  /** Where the player appears in the target room after travelling. */
  arrive?: Vec
  /** Where the player stands to interact (floor point). */
  stand: Vec
  /** World anchor for the floating prompt (usually above the furniture). */
  prompt: Vec
  /** Interaction radius around `stand`. */
  radius: number
  /** Clickable furniture footprint — clicking it walks the player to `stand`. */
  zone: Rect
  /** i18n key for the prompt label. */
  labelKey: string
  /** Fallback label (used as the i18n default). */
  labelZh: string
}

export interface PlacedNpc {
  id: string
  at: Vec
  facing: Facing
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface RoomDef {
  id: string
  bounds: Bounds
  obstacles: Rect[]
  hotspots: Hotspot[]
  npcs: PlacedNpc[]
  spawn: Vec
}

export const STAGE_W = 960
export const STAGE_H = 600

/** World px the feet anchor advances per animation frame (~60fps). */
export const PLAYER_SPEED = 2.7

export const DEFAULT_ROOM = 'atrium'

const STD_BOUNDS: Bounds = { minX: 70, maxX: 900, minY: 300, maxY: 545 }

// ── Atrium (hub: read / write / to the guild hall) ──
const ATRIUM: RoomDef = {
  id: 'atrium',
  bounds: STD_BOUNDS,
  obstacles: [
    { x: 586, y: 392, w: 226, h: 112 }, // writing desk
    { x: 116, y: 452, w: 152, h: 96 }, // armchair
  ],
  spawn: { x: 486, y: 470 },
  hotspots: [
    {
      id: 'stacks',
      kind: 'stacks',
      stand: { x: 188, y: 332 },
      prompt: { x: 180, y: 150 },
      radius: 102,
      zone: { x: 56, y: 60, w: 248, h: 206 },
      labelKey: 'frontStage.hotspot.stacks',
      labelZh: '典藏书柜 · 看书',
    },
    {
      id: 'desk',
      kind: 'desk',
      stand: { x: 699, y: 528 },
      prompt: { x: 699, y: 384 },
      radius: 104,
      zone: { x: 586, y: 380, w: 226, h: 132 },
      labelKey: 'frontStage.hotspot.desk',
      labelZh: '写字桌 · 写作',
    },
    {
      id: 'muse',
      kind: 'muse',
      stand: { x: 610, y: 330 },
      prompt: { x: 610, y: 196 },
      radius: 90,
      zone: { x: 548, y: 80, w: 128, h: 104 },
      labelKey: 'frontStage.hotspot.muse',
      labelZh: '灵感墙 · 收集',
    },
    {
      id: 'to-guild',
      kind: 'travel',
      target: 'guildhall',
      arrive: { x: 150, y: 470 },
      stand: { x: 838, y: 340 },
      prompt: { x: 897, y: 244 },
      radius: 96,
      zone: { x: 858, y: 96, w: 80, h: 204 },
      labelKey: 'frontStage.hotspot.guild',
      labelZh: '工位廊 · 见诸贤',
    },
  ],
  npcs: [],
}

// ── Guild Hall (工位廊): all eight scribes at their workstations ──
const HALL_IDS = ['olive', 'dorian', 'vera', 'sela', 'manny', 'sage', 'grim', 'muse']
const HALL_XS = [150, 244, 339, 433, 527, 621, 716, 810]
const HALL_NPC_Y = 356

const GUILD_HALL: RoomDef = {
  id: 'guildhall',
  bounds: STD_BOUNDS,
  obstacles: HALL_XS.map((x) => ({ x: x - 22, y: 344, w: 44, h: 30 })),
  spawn: { x: 120, y: 470 },
  hotspots: [
    ...HALL_IDS.map((id, i): Hotspot => ({
      id: `npc:${id}`,
      kind: 'npc',
      npcId: id,
      stand: { x: HALL_XS[i], y: 432 },
      prompt: { x: HALL_XS[i], y: 210 },
      radius: 44,
      zone: { x: HALL_XS[i] - 40, y: 318, w: 80, h: 84 },
      labelKey: 'frontStage.hotspot.npc',
      labelZh: '与贤者交谈',
    })),
    {
      id: 'to-atrium',
      kind: 'travel',
      target: 'atrium',
      arrive: { x: 806, y: 352 },
      stand: { x: 90, y: 432 },
      prompt: { x: 44, y: 330 },
      radius: 50,
      zone: { x: 0, y: 300, w: 60, h: 246 },
      labelKey: 'frontStage.hotspot.atrium',
      labelZh: '回中庭',
    },
    {
      id: 'to-roundtable',
      kind: 'travel',
      target: 'roundtable',
      arrive: { x: 120, y: 470 },
      stand: { x: 870, y: 432 },
      prompt: { x: 916, y: 330 },
      radius: 50,
      zone: { x: 900, y: 300, w: 60, h: 246 },
      labelKey: 'frontStage.hotspot.toRoundtable',
      labelZh: '圆桌厅 · 会诊',
    },
  ],
  npcs: HALL_IDS.map((id, i): PlacedNpc => ({ id, at: { x: HALL_XS[i], y: HALL_NPC_Y }, facing: 'down' })),
}

// ── Round Table (圆桌厅): invite scribes to critique a draft together ──
const RT_PANEL = ['olive', 'vera', 'sela', 'manny', 'sage']
const RT_SEAT_X = [330, 414, 498, 582, 480]
const RT_SEAT_Y = [316, 300, 300, 316, 286]

const ROUND_TABLE: RoomDef = {
  id: 'roundtable',
  bounds: STD_BOUNDS,
  obstacles: [{ x: 350, y: 322, w: 260, h: 110 }],
  spawn: { x: 120, y: 470 },
  hotspots: [
    {
      id: 'table',
      kind: 'roundtable',
      stand: { x: 480, y: 486 },
      prompt: { x: 480, y: 232 },
      radius: 120,
      zone: { x: 350, y: 300, w: 260, h: 150 },
      labelKey: 'frontStage.hotspot.roundtable',
      labelZh: '入座圆桌 · 会诊',
    },
    {
      id: 'archive',
      kind: 'archive',
      stand: { x: 820, y: 360 },
      prompt: { x: 860, y: 250 },
      radius: 80,
      zone: { x: 812, y: 110, w: 96, h: 200 },
      labelKey: 'frontStage.hotspot.archive',
      labelZh: '档案柜 · 版本史',
    },
    {
      id: 'to-guild',
      kind: 'travel',
      target: 'guildhall',
      arrive: { x: 870, y: 432 },
      stand: { x: 120, y: 430 },
      prompt: { x: 60, y: 332 },
      radius: 60,
      zone: { x: 0, y: 300, w: 66, h: 246 },
      labelKey: 'frontStage.hotspot.toGuild',
      labelZh: '回工位廊',
    },
  ],
  npcs: RT_PANEL.map((id, i): PlacedNpc => ({ id, at: { x: RT_SEAT_X[i], y: RT_SEAT_Y[i] }, facing: 'down' })),
}

export const ROOMS: Record<string, RoomDef> = {
  atrium: ATRIUM,
  guildhall: GUILD_HALL,
  roundtable: ROUND_TABLE,
}

/** True when the feet anchor at (x,y) is outside the room or inside an obstacle. */
export function isBlocked(room: RoomDef, x: number, y: number): boolean {
  const b = room.bounds
  if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return true
  for (const r of room.obstacles) {
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true
  }
  return false
}

/** Nearest hotspot whose stand-point is within its radius of the feet, else null. */
export function activeHotspotFor(room: RoomDef, feet: Vec): Hotspot | null {
  let best: Hotspot | null = null
  let bestDist = Infinity
  for (const h of room.hotspots) {
    const d = Math.hypot(feet.x - h.stand.x, feet.y - h.stand.y)
    if (d < h.radius && d < bestDist) {
      best = h
      bestDist = d
    }
  }
  return best
}

/** Hotspot whose clickable furniture zone contains (x, y), else null. */
export function zoneAt(room: RoomDef, x: number, y: number): Hotspot | null {
  for (const h of room.hotspots) {
    const z = h.zone
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return h
  }
  return null
}

/** Whether (x, y) lands on a hotspot's floating prompt (for click activation). */
export function promptHit(h: Hotspot, x: number, y: number): boolean {
  return Math.abs(x - h.prompt.x) <= 80 && Math.abs(y - h.prompt.y) <= 20
}
