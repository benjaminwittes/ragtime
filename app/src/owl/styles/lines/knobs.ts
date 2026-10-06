import { owlLinesKnobs } from '../../knobs/lines'
import { DEFAULT_LINE_STYLE } from './engine'

/** What the section's controls move; everything else comes from the size (`presetFor`). */
export type LineKnobs = typeof DEFAULT_LINE_STYLE & { lines: number; pitch: number; tile: number }

const declared = (name: string): number => {
  const knob = owlLinesKnobs.find((k) => k.id === 'owl.lines.build.' + name)
  if (typeof knob?.value !== 'number') throw new Error(`no owl.lines.build.${name} knob`)
  return knob.value
}

/**
 * The owl's build as its knobs declare it (`knobs/lines.ts`), for the lab to draw its specimens
 * with. Read from the declarations, not copied from them: there is one copy of each number.
 */
export const DEFAULT_KNOBS = Object.fromEntries(
  [...Object.keys(DEFAULT_LINE_STYLE), 'lines', 'pitch', 'tile'].map((name) => [name, declared(name)]),
) as LineKnobs

export type LineSubject = 'c' | 'lantern'
