import { useMemo, useSyncExternalStore } from 'react'
import { subscribeTune, tuneValue, tuneVersion } from '@/tune/store'
import type { Engrave } from './engrave'
import type { LineKnobs } from './knobs'
import type { Print } from './print'
import { PRINT_ON } from './print'

/**
 * The owl's build, read from its knobs (`knobs/lines.ts`): the engine's numbers, the engraving's,
 * and the pace of its motion. The objects are new only when a knob has moved, because the
 * drawing's loop restarts when they change.
 */

const num = (id: string, fallback: number): number => {
  const v = tuneValue(id)
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function useBuild(motion: string, scan: boolean): { knobs: LineKnobs; engrave: Engrave; print: Print } {
  const version = useSyncExternalStore(subscribeTune, tuneVersion, tuneVersion)
  const built = useMemo(() => {
    const k = (name: string, fallback: number) => num('owl.lines.build.' + name, fallback)
    const knobs: LineKnobs = {
      lines: k('lines', 0),
      pitch: k('pitch', 1),
      tile: k('tile', 1),
      lock: k('lock', 0.5),
      bead: k('bead', 0.6),
      minW: k('minW', 0),
      maxW: k('maxW', 1.08),
      gamma: k('gamma', 1.6),
      bulge: k('bulge', 0.5),
      cut: k('cut', 0.1),
      snapPx: k('snapPx', 0.9),
    }
    const e = (name: string, fallback: number) => num('owl.lines.engrave.' + name, fallback)
    const engrave: Engrave = { hatch: e('hatch', 0.7), angle: e('angle', 52), pitch: e('pitch', 1.5), keyline: e('keyline', 0.45) }
    return { knobs, engrave, amount: num('owl.lines.print.amount', 0.45), jitter: num('owl.lines.print.jitter', 1), fps: num('owl.lines.print.fps', 12) }
    // Read through the store; `version` is what says a value moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])
  const lively = motion === 'lively'
  const print = useMemo<Print>(
    () => ({ ...PRINT_ON, bar: false, scan, amount: built.amount * (lively ? 1.5 : 1), jitter: built.jitter, fps: Math.round(built.fps * (lively ? 1.35 : 1)) }),
    [built.amount, built.jitter, built.fps, lively, scan],
  )
  return { knobs: built.knobs, engrave: built.engrave, print }
}
