/**
 * What the Explorer exposes to the tuning panel.
 *
 * Two kinds of knob, and the split is the interesting part. The **structure**
 * knobs are the page's own promoted literals — the measure, the trail's share
 * of the width, the padding, the radii — declared at the top of `explorer.css`
 * and referenced by the rules below it. The **state** colours are the four this
 * sheet still owns outright; the rest of its palette reads the app's tokens, so
 * those are tuned on the Globals tab and follow the theme by design.
 *
 * `derived: true` marks the ones that read `var(--…)` in source. They tune like
 * any other — the overlay just sets the property — but writing one would put a
 * literal where a reference is, which is precisely the seam the merge is
 * arguing about. The panel asks before it does that.
 *
 * Fork 4 is the reason this file exists in this branch: the argument about
 * whether the Explorer keeps its own language or moves onto the kit is an
 * argument about measure, rhythm and radius, and those are cheaper to settle by
 * moving them while looking at the page than by reading two mockups.
 */

import { defineSurface, defineTunables } from '@/tune/registry'
import { useTunable } from '@/tune/useTunable'

const CSS = 'src/explorer/explorer.css'
const SELF = 'src/explorer/tune.ts'

export const explorerSurface = defineSurface({
  id: 'explorer',
  label: 'Explorer',
  selector: '.explorer',
  file: CSS,
})

export const explorerKnobs = defineTunables([
  /* ---- Layout ---------------------------------------------------------- */
  {
    id: 'explorer.measure',
    label: 'Answer measure',
    group: 'Layout',
    scope: 'explorer',
    kind: 'length',
    value: '80ch',
    prop: '--x-measure',
    units: ['ch', 'rem', 'px'],
    min: 40,
    max: 120,
    step: 1,
    source: { file: CSS, selector: '.explorer' },
    note: 'The conversation and the brief above it share this, so an answer never outruns the brief it ran against.',
  },
  {
    id: 'explorer.emptyMeasure',
    label: 'Empty-state measure',
    group: 'Layout',
    scope: 'explorer',
    kind: 'length',
    value: '72ch',
    prop: '--x-empty-measure',
    units: ['ch', 'rem', 'px'],
    min: 40,
    max: 110,
    step: 1,
    source: { file: CSS, selector: '.explorer' },
    note: 'Narrower than the answer on purpose: the first screen is a lede, not a document.',
  },
  {
    id: 'explorer.trailLeft',
    label: 'Conversation share',
    group: 'Layout',
    scope: 'explorer',
    kind: 'length',
    value: '1.45fr',
    prop: '--x-trail-left',
    units: ['fr'],
    min: 0.6,
    max: 4,
    step: 0.05,
    source: { file: CSS, selector: '.explorer' },
    note: 'Against the trail’s 1fr, while the trail is open.',
  },
  {
    id: 'explorer.trailMin',
    label: 'Trail floor',
    group: 'Layout',
    scope: 'explorer',
    kind: 'length',
    value: '300px',
    prop: '--x-trail-min',
    units: ['px', 'ch', 'rem'],
    min: 180,
    max: 560,
    step: 4,
    source: { file: CSS, selector: '.explorer' },
  },
  {
    id: 'explorer.padY',
    label: 'Column padding, vertical',
    group: 'Layout',
    scope: 'explorer',
    kind: 'length',
    value: '18px',
    prop: '--x-pad-y',
    units: ['px', 'rem'],
    min: 0,
    max: 64,
    step: 1,
    source: { file: CSS, selector: '.explorer' },
  },
  {
    id: 'explorer.padX',
    label: 'Column padding, horizontal',
    group: 'Layout',
    scope: 'explorer',
    kind: 'length',
    value: '20px',
    prop: '--x-pad-x',
    units: ['px', 'rem'],
    min: 0,
    max: 64,
    step: 1,
    source: { file: CSS, selector: '.explorer' },
  },
  {
    id: 'explorer.bubbleIndent',
    label: 'Reader’s turn indent',
    group: 'Layout',
    scope: 'explorer',
    kind: 'length',
    value: '15%',
    prop: '--x-bubble-indent',
    units: ['%', 'px'],
    min: 0,
    max: 50,
    step: 1,
    source: { file: CSS, selector: '.explorer' },
    note: 'A reply to a clarifying question sits at twice this.',
  },

  /* ---- Shape ----------------------------------------------------------- */
  {
    id: 'explorer.radius',
    label: 'Control radius',
    group: 'Shape',
    scope: 'explorer',
    kind: 'length',
    value: '3px',
    prop: '--x-radius',
    units: ['px', 'rem'],
    min: 0,
    max: 24,
    step: 1,
    source: { file: CSS, selector: '.explorer' },
    note: 'Buttons, fields and menus — the things a reader acts on, which are now the only things here with corners. The app’s own radius, said again rather than referenced so this slider has a number to rest on.',
  },
  {
    id: 'explorer.radiusCard',
    label: 'Card radius',
    group: 'Shape',
    scope: 'explorer',
    kind: 'length',
    value: '12px',
    prop: '--x-radius-card',
    units: ['px', 'rem'],
    min: 0,
    max: 32,
    step: 1,
    source: { file: CSS, selector: '.explorer' },
    note: 'The brief, and only the brief: the bubbles and the answer stopped being boxes, and the examples are a control now, so they follow the control radius.',
  },

  /* ---- Type ------------------------------------------------------------ */
  {
    id: 'explorer.baseSize',
    label: 'Interface size',
    group: 'Type',
    scope: 'explorer',
    kind: 'length',
    value: '15px',
    prop: '--x-base-size',
    units: ['px', 'rem'],
    min: 11,
    max: 22,
    step: 0.5,
    source: { file: CSS, selector: '.explorer' },
    note: 'The page’s base. The answer speaks in the same face now, one step up at the site’s body size; the editorial face is kept for headings, document names and quoted words.',
  },

  /* ---- Colour (the four states this sheet still owns) ------------------- */
  {
    id: 'explorer.warn',
    label: 'Warn',
    group: 'Colour',
    scope: 'explorer',
    kind: 'color',
    value: '#9a5b12',
    prop: '--warn',
    source: { file: CSS, selector: '.explorer' },
    note: 'The brief, the clarifying question, an allowance running out.',
  },
  {
    id: 'explorer.warnSoft',
    label: 'Warn wash',
    group: 'Colour',
    scope: 'explorer',
    kind: 'color',
    value: '#fff4e5',
    prop: '--warn-soft',
    source: { file: CSS, selector: '.explorer' },
  },
  {
    id: 'explorer.ok',
    label: 'OK',
    group: 'Colour',
    scope: 'explorer',
    kind: 'color',
    value: '#1f7a3a',
    prop: '--ok',
    source: { file: CSS, selector: '.explorer' },
  },
  {
    id: 'explorer.bad',
    label: 'Bad',
    group: 'Colour',
    scope: 'explorer',
    kind: 'color',
    value: '#a52a2a',
    prop: '--bad',
    source: { file: CSS, selector: '.explorer' },
  },
  {
    id: 'explorer.accent',
    label: 'Accent (follows theme)',
    group: 'Colour',
    scope: 'explorer',
    kind: 'color',
    value: 'var(--primary, #006a72)',
    prop: '--accent',
    derived: true,
    source: { file: CSS, selector: '.explorer' },
    note: 'Reads the app’s primary. Tune it here to try one; change it for real on Globals.',
  },

  /* ---- Behaviour (runtime, not CSS) ------------------------------------ */
  {
    id: 'explorer.exampleCount',
    label: 'Example questions',
    group: 'Behaviour',
    scope: 'explorer',
    kind: 'int',
    value: 3,
    min: 0,
    max: 3,
    step: 1,
    source: { file: SELF },
    note: 'How many of the three shapes the empty state offers before the reader types.',
  },
])

/** How many example questions the empty state shows. */
export function useExampleCount(): number {
  return useTunable<number>('explorer.exampleCount')
}
