import { describe, expect, it } from 'vitest'
import { owlGaze } from './gaze'

// A 100px owl with its top-left corner at (200, 100): the eyes are at (250, 138).
const box = { left: 200, top: 100, width: 100, height: 100 }
const EYE_Y = 38
const TRAVEL = 2

describe('owlGaze', () => {
  it('looks straight ahead when the pointer is on the eyes', () => {
    expect(owlGaze(box, EYE_Y, TRAVEL, 250, 138)).toEqual({ x: 0, y: 0 })
  })

  it('looks straight ahead when the owl has no box', () => {
    expect(owlGaze({ left: 0, top: 0, width: 0, height: 0 }, EYE_Y, TRAVEL, 500, 500)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('looks toward a far pointer at full travel, and never past it', () => {
    const right = owlGaze(box, EYE_Y, TRAVEL, 5000, 138)
    expect(right.x).toBeCloseTo(TRAVEL)
    expect(right.y).toBeCloseTo(0)

    const below = owlGaze(box, EYE_Y, TRAVEL, 250, 5000)
    expect(below.x).toBeCloseTo(0)
    expect(below.y).toBeCloseTo(TRAVEL)

    const diagonal = owlGaze(box, EYE_Y, TRAVEL, -5000, -5000)
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(TRAVEL)
    expect(diagonal.x).toBeLessThan(0)
    expect(diagonal.y).toBeLessThan(0)
  })

  it('deflects in proportion while the pointer is near', () => {
    // 75px to the right is half of the figure-and-a-half ramp.
    const near = owlGaze(box, EYE_Y, TRAVEL, 325, 138)
    expect(near.x).toBeCloseTo(TRAVEL / 2)
    expect(near.y).toBeCloseTo(0)
  })

  it('measures from the eyes, not from the middle of the figure', () => {
    // Level with the middle of the box is below the eyes, so the owl looks down.
    expect(owlGaze(box, EYE_Y, TRAVEL, 250, 150).y).toBeGreaterThan(0)
  })
})
