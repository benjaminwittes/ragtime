/**
 * What the hub exposes to the tuning panel.
 *
 * Two structure knobs promoted into `hub.css`, and three behaviour knobs that
 * are not CSS at all: how many rows a count result previews, how far a cell is
 * truncated, and how long the hero's title and placeholder hold before they
 * move on. All three are parameters of what the page *says*, which is the half
 * of design a stylesheet cannot reach — and the first two were literals buried
 * in `HubAmaSearch.tsx` until a knob made them arguable.
 */

import { defineSurface, defineTunables } from '@/tune/registry'
import { useTunable } from '@/tune/useTunable'

const CSS = 'src/hub/hub.css'
const SELF = 'src/hub/tune.ts'
const SELECTOR = '[data-tune="hub"]'

export const hubSurface = defineSurface({
  id: 'hub',
  label: 'Hub',
  selector: SELECTOR,
  file: CSS,
})

export const hubKnobs = defineTunables([
  {
    id: 'hub.measure',
    label: 'Page measure',
    group: 'Layout',
    scope: 'hub',
    kind: 'length',
    value: '64rem',
    prop: '--hub-measure',
    units: ['rem', 'px', 'ch'],
    min: 40,
    max: 96,
    step: 0.5,
    source: { file: CSS, selector: SELECTOR },
    note: 'The hub body column. The site bar is above every route now and sets its own measure.',
  },
  {
    id: 'hub.gutter',
    label: 'Gutter',
    group: 'Layout',
    scope: 'hub',
    kind: 'length',
    value: '1.5rem',
    prop: '--hub-gutter',
    units: ['rem', 'px'],
    min: 0,
    max: 6,
    step: 0.125,
    source: { file: CSS, selector: SELECTOR },
  },
  {
    id: 'hub.title.print',
    label: 'Photocopied title',
    group: 'Title',
    scope: 'hub',
    kind: 'boolean',
    value: true,
    user: true,
    source: { file: SELF },
    note: 'A faint photocopy finish and fine lines through the title. Off, the title is plain type.',
  },
  {
    id: 'hub.title.lines',
    label: 'Lined title',
    group: 'Title',
    scope: 'hub',
    kind: 'boolean',
    value: true,
    user: true,
    parent: 'hub.title.print',
    source: { file: SELF },
    note: 'The title drawn as the owl is: parallel lines that thicken and thin with the letters. The words stay real text, to select and to read aloud.',
  },
  {
    id: 'hub.title.pitch',
    label: 'Title line spacing',
    group: 'Title',
    scope: 'hub',
    kind: 'number',
    value: 1.8,
    min: 1.4,
    max: 4,
    step: 0.1,
    source: { file: SELF },
    note: 'Pixels between the title’s lines at the desktop size; a smaller title scales it down, to no finer than a pixel and a half.',
  },
  {
    id: 'hub.previewRows',
    label: 'Preview rows',
    group: 'Behaviour',
    scope: 'hub',
    kind: 'int',
    value: 25,
    min: 3,
    max: 100,
    step: 1,
    source: { file: SELF },
    note: 'How much of a count answer the table shows. The summary line stays honest about the total either way.',
  },
  {
    id: 'hub.cellChars',
    label: 'Cell truncation',
    group: 'Behaviour',
    scope: 'hub',
    kind: 'int',
    value: 200,
    min: 20,
    max: 600,
    step: 10,
    source: { file: SELF },
    note: 'Characters of a cell before it is cut. Long titles are the reason the table wraps.',
  },
  {
    id: 'hub.tick',
    label: 'Sample dwell',
    group: 'Behaviour',
    scope: 'hub',
    kind: 'number',
    value: 3,
    min: 1,
    max: 12,
    step: 0.5,
    source: { file: SELF },
    note: 'Seconds a finished sample stands in the box before the next one types itself. The typing is on top of this, and is as long as the sample; a corpus holds the title for three of them.',
  },
])

/** How many rows of a count result the table draws. */
export function usePreviewRows(): number {
  return useTunable<number>('hub.previewRows')
}

/** How many characters of a cell survive before truncation. */
export function useCellChars(): number {
  return useTunable<number>('hub.cellChars')
}

/**
 * How long a finished sample holds, in seconds, before the hero types the next.
 *
 * In seconds rather than milliseconds because this is a number a person moves
 * while watching the page, and "three" is the unit that sentence is thought in —
 * and because GSAP, which the one caller hands it to, counts in seconds too.
 */
export function useTick(): number {
  return useTunable<number>('hub.tick')
}
