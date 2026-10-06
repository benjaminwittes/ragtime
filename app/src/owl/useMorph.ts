import { useMemo } from 'react'
import type { MorphParams } from '@/hub/lineMorph/engine'
import { useTunable } from '@/tune/useTunable'
import './knobs/morph'

/**
 * The line morph as the owl is tuned to write it (`knobs/morph.ts`): the engine's numbers, which include the swipe's speed. A knob moved in the panel changes the next note; the declared defaults are what ships.
 */
export function useMorph(): { params: MorphParams; pitch: number } {
  const pitch = useTunable<number>('owl.morph.pitch')
  const speed = useTunable<number>('owl.morph.speed')
  const cover = useTunable<number>('owl.morph.cover')
  const winWidth = useTunable<number>('owl.morph.window')
  const spread = useTunable<number>('owl.morph.spread')
  const gain = useTunable<number>('owl.morph.gain')
  const ramp = useTunable<number>('owl.morph.ramp')
  const shift = useTunable<number>('owl.morph.shift')
  const trail = useTunable<number>('owl.morph.trail')
  const entry = useTunable<number>('owl.morph.entry')
  const pieces = useTunable<number>('owl.morph.pieces')
  const stagger = useTunable<number>('owl.morph.stagger')
  const params = useMemo<MorphParams>(
    () => ({ cover, winWidth, windowOn: true, spread, gain, ramp, shift, trail, entry, speed, pieces, stagger }),
    [cover, winWidth, spread, gain, ramp, shift, trail, entry, speed, pieces, stagger],
  )
  return { params, pitch }
}
