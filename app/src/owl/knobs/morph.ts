import { defineTunables } from '@/tune/registry'

/**
 * How the owl's words write themselves: the line morph (`hub/lineMorph/`), whose numbers were found in the
 * lab (`/ragtime/line-lab`, `owl/lab/LineLab.tsx`) and written here from it. The `value:` of each declaration is
 * the only copy of that number: the note reads them through `useMorph.ts`, and the lab starts from them and
 * writes them back, so a knob moved in the panel or the lab is the owl on the page changing. The labels,
 * ranges and notes are in `panel/morph.ts`.
 *
 * None is a path into the design (the ids do not begin `owl.design.`).
 */

export const owlMorphKnobs = defineTunables([
  {
    id: 'owl.morph.speed',
    value: 14.8,
  },
  {
    id: 'owl.morph.pitch',
    value: 8,
  },
  {
    id: 'owl.morph.cover',
    value: 0.2,
  },
  {
    id: 'owl.morph.window',
    value: 6,
  },
  {
    id: 'owl.morph.spread',
    value: 8,
  },
  {
    id: 'owl.morph.gain',
    value: 0.8,
  },
  {
    id: 'owl.morph.ramp',
    value: 1.18,
  },
  {
    id: 'owl.morph.shift',
    value: -0.39,
  },
  {
    id: 'owl.morph.trail',
    value: 0.6,
  },
  {
    id: 'owl.morph.entry',
    value: 0.6,
  },
  {
    id: 'owl.morph.pieces',
    value: 2,
  },
  {
    id: 'owl.morph.stagger',
    value: 0.5,
  },
])
