/**
 * PixiPawn — a chibi figure (Pixi Container) anchored at the FEET (0,0), body
 * drawn in negative-y. Shaded torso + head, a little face (big eyes with a
 * highlight, brows, blush, a smile), ears, a scarf + belt, and two swinging
 * arms. `setPose` flips for facing, swings arms/legs + bobs while walking,
 * breathes when idle, and blinks (offset per pawn so a crowd isn't in sync).
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { shade } from './roomBuild'
import type { Facing } from '../sceneConfig'

export interface PawnColors {
  skin: number
  hair: number
  tunic: number
  scarf?: number
}

const OUTLINE = 0x2a1c14

export class PixiPawn extends Container {
  private flip = new Container()
  private bob = new Container()
  private legL = new Container()
  private legR = new Container()
  private armL = new Container()
  private armR = new Container()
  private face = new Container()
  private eyeL = new Graphics()
  private eyeR = new Graphics()
  private blinkPhase = Math.random() * 6

  constructor(colors: PawnColors, name?: string) {
    super()
    const { skin, hair, tunic } = colors
    const scarf = colors.scarf ?? shade(tunic, 0.26)

    // Contact shadow
    const shadow = new Graphics()
    shadow.ellipse(0, -1, 13, 4.5).fill({ color: 0x000000, alpha: 0.26 })
    shadow.ellipse(0, -1, 8, 3).fill({ color: 0x000000, alpha: 0.16 })
    this.addChild(shadow)

    // Legs (grounded; step while walking)
    const mkLeg = (x: number) => {
      const c = new Container()
      const g = new Graphics()
      g.roundRect(-2.6, -12, 5.2, 12, 2).fill(0x4a3a2c).stroke({ width: 1.5, color: OUTLINE })
      g.roundRect(-3.2, -3.6, 7, 4, 2).fill(0x2e2118).stroke({ width: 1.5, color: OUTLINE })
      c.addChild(g)
      c.x = x
      return c
    }
    this.legL = mkLeg(-4)
    this.legR = mkLeg(4)

    // Torso with shading, scarf and belt
    const torso = new Graphics()
    torso.roundRect(-9, -28, 18, 16, 4).fill(tunic)
    torso.rect(-7.5, -27, 15, 4).fill(shade(tunic, 0.16))
    torso.rect(-7.5, -15.5, 15, 3).fill(shade(tunic, -0.2))
    torso.roundRect(-9, -28, 18, 16, 4).stroke({ width: 2, color: OUTLINE })
    torso.rect(-9, -17, 18, 2).fill(0x3a2a1c)
    torso.rect(-2, -18, 4, 4).fill(0xcaa84a).stroke({ width: 1, color: OUTLINE })
    torso.roundRect(-6.5, -29.5, 13, 3.5, 1.5).fill(scarf).stroke({ width: 1, color: shade(scarf, -0.3) })

    // Arms (pivot at the shoulder)
    const mkArm = (x: number) => {
      const c = new Container()
      const g = new Graphics()
      g.roundRect(-2, 0, 4, 12, 2).fill(shade(tunic, -0.06)).stroke({ width: 1.5, color: OUTLINE })
      g.circle(0, 12.5, 2.3).fill(skin).stroke({ width: 1.2, color: OUTLINE })
      c.addChild(g)
      c.x = x
      c.y = -26
      return c
    }
    this.armL = mkArm(-10)
    this.armR = mkArm(10)

    // Head
    const head = new Graphics()
    head.circle(-9, -35.5, 2.1).fill(skin).stroke({ width: 1.5, color: OUTLINE })
    head.circle(9, -35.5, 2.1).fill(skin).stroke({ width: 1.5, color: OUTLINE })
    head.roundRect(-9, -45, 18, 17, 6).fill(skin)
    head.rect(-9, -31, 18, 3).fill(shade(skin, -0.1))
    head.roundRect(-9, -45, 18, 17, 6).stroke({ width: 2, color: OUTLINE })

    // Face (hidden when facing away)
    const mkEye = (cx: number) => {
      const e = new Graphics()
      e.roundRect(-1.7, -2.2, 3.4, 4.4, 1.4).fill(0x2a1c20)
      e.circle(0.7, -1.2, 0.8).fill(0xffffff)
      e.x = cx
      e.y = -36
      return e
    }
    this.eyeL = mkEye(-4.2)
    this.eyeR = mkEye(4.2)
    const brows = new Graphics()
    brows.rect(-6.2, -40, 3.4, 1.2).fill(shade(hair, -0.1))
    brows.rect(2.8, -40, 3.4, 1.2).fill(shade(hair, -0.1))
    const blush = new Graphics()
    blush.circle(-6, -33, 1.9).fill({ color: 0xe8806a, alpha: 0.5 })
    blush.circle(6, -33, 1.9).fill({ color: 0xe8806a, alpha: 0.5 })
    const mouth = new Graphics()
    mouth.roundRect(-1.6, -32, 3.2, 1.5, 0.8).fill(0x9a5040)
    this.face.addChild(blush, brows, this.eyeL, this.eyeR, mouth)

    // Hair (over the forehead) + highlight
    const hg = new Graphics()
    hg.roundRect(-10, -47.5, 20, 10, 5).fill(hair)
    hg.rect(-10, -41, 4.5, 4).fill(hair)
    hg.rect(5.5, -41, 4.5, 4).fill(hair)
    hg.rect(-2.5, -42, 5, 3.5).fill(hair)
    hg.roundRect(-10, -47.5, 20, 10, 5).stroke({ width: 2, color: OUTLINE })
    hg.roundRect(-8.5, -46.5, 7, 2.4, 1.2).fill(shade(hair, 0.22))

    const headC = new Container()
    headC.addChild(head, this.face, hg)

    this.bob.addChild(torso, this.armL, this.armR, headC)
    this.flip.addChild(this.legL, this.legR, this.bob)
    this.addChild(this.flip)

    if (name) {
      const style = new TextStyle({ fontFamily: '"Pixelify Sans", system-ui, sans-serif', fontSize: 12, fill: 0xfbe7c2 })
      const tag = new Text({ text: name, style })
      tag.anchor.set(0.5, 1)
      tag.y = -52
      const pad = 5
      const bg = new Graphics()
        .roundRect(-tag.width / 2 - pad, -52 - tag.height - 1, tag.width + pad * 2, tag.height + 3, 3)
        .fill({ color: 0x1c120a, alpha: 0.8 })
        .stroke({ width: 1, color: 0x785a3c, alpha: 0.5 })
      this.addChild(bg, tag)
    }
  }

  setPose(x: number, y: number, facing: Facing, moving: boolean, time: number) {
    this.x = x
    this.y = y
    this.flip.scale.x = facing === 'left' ? -1 : 1
    this.face.visible = facing !== 'up'

    if (moving) {
      const s = Math.sin(time * 11)
      this.bob.y = -Math.abs(s) * 2
      this.armL.rotation = s * 0.5
      this.armR.rotation = -s * 0.5
      this.legL.y = s * 1.6
      this.legR.y = -s * 1.6
    } else {
      const s = Math.sin(time * 1.7)
      this.bob.y = s * -0.7
      this.armL.rotation = s * 0.06
      this.armR.rotation = -s * 0.06
      this.legL.y = 0
      this.legR.y = 0
    }

    const blinking = (time + this.blinkPhase) % 3.6 > 3.48
    const ey = blinking ? 0.1 : 1
    this.eyeL.scale.y = ey
    this.eyeR.scale.y = ey
  }
}
