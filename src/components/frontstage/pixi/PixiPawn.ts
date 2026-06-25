/**
 * PixiPawn — a chibi figure (Pixi Container) anchored at the FEET (0,0), body
 * drawn upward in negative-y. Blocky front-facing build: two legs, a shirt body
 * with sleeves + skin hands, a tall rounded head with hair + sideburns, simple
 * dark eyes, a wide ground shadow, and an optional name tag. Flat fills, no
 * outlines — matching the imported Round Table design.
 *
 * `setPose` keeps the engine's interface: it places the feet, mirrors on a
 * left facing (the silhouette is symmetric, so this is a no-op cue today), and
 * adds a gentle vertical bob while walking. Idle is still, like the design.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { Facing } from '../sceneConfig'

export interface PawnColors {
  /** Shirt / spine colour. */
  tunic: number
  /** Hair colour. */
  hair: number
  /** Skin tone (defaults to the shared warm tone). */
  skin?: number
}

const SKIN = 0xf0c9a0
const LEGS = 0x2c2533
const EYES = 0x2a1f17

export class PixiPawn extends Container {
  private flip = new Container()
  private body = new Graphics()

  constructor(colors: PawnColors, name?: string) {
    super()
    const skin = colors.skin ?? SKIN
    const { tunic, hair } = colors

    // Wide ground shadow (stays put while the body bobs).
    const shadow = new Graphics()
    shadow.ellipse(0, 2, 26, 11).fill({ color: 0x000000, alpha: 0.32 })
    this.addChild(shadow)

    const g = this.body
    // Legs
    g.roundRect(-9, -15, 7, 15, 2).roundRect(2, -15, 7, 15, 2).fill(LEGS)
    // Shirt body + sleeves
    g.roundRect(-13, -37, 26, 24, 5).fill(tunic)
    g.roundRect(-15, -35, 6, 16, 3).roundRect(9, -35, 6, 16, 3).fill(tunic)
    // Hands
    g.roundRect(-15, -21, 6, 5, 2).roundRect(9, -21, 6, 5, 2).fill(skin)
    // Head
    g.roundRect(-11, -57, 22, 21, 5).fill(skin)
    // Hair + sideburns
    g.roundRect(-12, -59, 24, 11, 5).rect(-12, -52, 3, 6).rect(9, -52, 3, 6).fill(hair)
    // Eyes
    g.roundRect(-6, -46, 3, 4, 1).roundRect(3, -46, 3, 4, 1).fill(EYES)

    this.flip.addChild(g)
    this.addChild(this.flip)

    if (name) {
      const tag = new Container()
      tag.y = -78
      const t = new Text({
        text: name,
        style: new TextStyle({
          fontFamily: '"Pixelify Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 15,
          fill: 0xf3e6c8,
        }),
      })
      t.resolution = 2
      t.anchor.set(0.5)
      const bg = new Graphics()
      bg
        .roundRect(-t.width / 2 - 9, -12, t.width + 18, 24, 7)
        .fill({ color: 0x140e0a, alpha: 0.74 })
        .stroke({ width: 1.5, color: 0x6a4a2a, alpha: 0.85 })
      tag.addChild(bg, t)
      this.addChild(tag)
    }
  }

  setPose(x: number, y: number, facing: Facing, moving: boolean, time: number) {
    this.x = x
    this.y = y
    this.flip.scale.x = facing === 'left' ? -1 : 1
    this.body.y = moving ? Math.sin(time * 10) * 1.6 : 0
  }
}
