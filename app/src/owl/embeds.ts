import type { TuneValue } from '@/tune/types'
import type { OwlSite, OwlSiteId } from './types'
import type { SpeechSite } from './voice/types'

/**
 * How the owl is embedded on each page: one table, one file.
 *
 * Each entry says what the owl is at that site — the pose, the lantern it has unless the
 * page says otherwise, whether it keeps late hours, what it is called, and the classes
 * that place it. The page keeps only what is dynamic: `loading` becoming `searching`,
 * the gate's wrong code becoming a shake. Everything else about "how the owl sits on that
 * page" is edited here, and the sizes and per-site variants are on the Tune panel's Owl
 * tab (`knobs/embeds.ts`).
 *
 * Sizes are not in this table. A width is a tunable number, so its one copy is the
 * `value:` of its knob (`owl.embed.<id>.size`, and `.sizeSm` where a site has a second
 * width); the classes below read it as `w-[var(--owl-size)]`. `siteVars` turns the knobs
 * into those properties, and `OwlSpot` sets them on whichever element carries the width.
 *
 * Where the page wraps the owl in a figure of its own (`SurfaceIntro`, which names the
 * wrapper for the view transition that carries the hub's owl to the Explorer's), that
 * wrapper is the element that carries the width and its classes are `figureClassName`;
 * the `<svg>` then fills it. Everywhere else the `<svg>` carries the width itself.
 *
 * To add a site: add its id to `OwlSiteId` in `types.ts`, an entry here, and its
 * `size` knob (and `variant` knob, if wanted) to `knobs/embeds.ts`.
 */
export const SITES: Record<OwlSiteId, OwlSite> = {
  // The first screen's owl, on the stacks. Above the title on a phone or a tablet. On a desktop (`lg`) it
  // perches at the top left of the first screen, out of the flow, with its note beside it. All of that, and the
  // width from the size knobs, is the one rule `.owl-perch` (`owl.css`; the hero section is `.owl-perch-ground`).
  // Its box is the one that travels to the Explorer's owl on a route change.
  hub: {
    label: 'Hub, above the title; top left on a desktop',
    pose: 'stacks',
    lantern: 'dark',
    keepsHours: true,
    className: 'w-full',
    figureClassName: 'owl-perch',
  },
  // The Explorer's face: the owl standing, which is the pose its concept sheet recommends
  // for an avatar. Sized by `explorer.css` (`.owl-figure`) from the same property.
  explorer: {
    label: 'Explorer, empty state',
    pose: 'archivist',
    lantern: 'dark',
    keepsHours: true,
    className: '',
    figureClassName: 'owl-figure',
  },
  // The owl keeps the door.
  gate: {
    label: 'Access gate',
    pose: 'archivist',
    lantern: 'dark',
    keepsHours: false,
    className: 'mb-4 w-[var(--owl-size)]',
  },
  // Out with the lantern, looking for the page that is not here.
  'not-found': {
    label: 'Not found',
    pose: 'archivist',
    lantern: 'searching',
    keepsHours: false,
    className: 'mb-5 w-[var(--owl-size)]',
  },
  // The owl keeps the house while it is empty, as it keeps the door.
  stage: {
    label: 'Stage, while empty',
    pose: 'archivist',
    lantern: 'dark',
    keepsHours: true,
    title: 'RAGtime',
    className: 'mx-auto w-[var(--owl-size)]',
  },
  // The archivist, and this is the archive being fetched: it stands beside what was asked
  // for, with its lantern up for as long as the collection has not answered.
  record: {
    label: 'Stage, record header',
    pose: 'archivist',
    lantern: 'dark',
    keepsHours: false,
    className: 'w-full',
    figureClassName: 'col-start-1 row-span-2 row-start-1 w-[var(--owl-size)]',
  },
}

/**
 * What each site says about its owl's *speech*, beside what it says about the owl
 * (`SITES`): where the speech sits, the occasion the owl opens with, and every occasion
 * the site can truthfully report. An occasion not listed here is one this site's page
 * never passes in, so the owl cannot speak it there however a voice is written.
 *
 * `place` is where the speech sits when there is room (`voice/fit.ts` moves it when there
 * is not). Each is chosen so the speech lands on bare paper and not on the thing the reader
 * is about to use: beside the hub's owl, which has the title and then the search box
 * beneath it; beside the gate's, which has the code field beneath it.
 */
export const SPEECH_SITES: Record<OwlSiteId, SpeechSite> = {
  hub: {
    place: 'beside',
    arrival: 'arrive-hub',
    occasions: ['arrive-hub', 'searching', 'search-empty', 'search-results', 'night', 'idle', 'poke'],
    keepsHours: SITES.hub.keepsHours,
  },
  explorer: {
    place: 'beside',
    arrival: 'explorer-empty',
    occasions: ['explorer-empty', 'night', 'idle', 'poke'],
    keepsHours: SITES.explorer.keepsHours,
  },
  gate: {
    place: 'beside',
    arrival: 'arrive-gate',
    occasions: ['arrive-gate', 'wrong-code', 'idle', 'poke'],
    keepsHours: SITES.gate.keepsHours,
  },
  'not-found': {
    place: 'beside',
    arrival: 'not-found',
    occasions: ['not-found', 'idle', 'poke'],
    keepsHours: SITES['not-found'].keepsHours,
  },
  stage: {
    place: 'beside',
    arrival: 'stage-quiet',
    occasions: ['stage-quiet', 'night', 'idle', 'poke'],
    keepsHours: SITES.stage.keepsHours,
  },
  // The header is a grid with the heading to the owl's right and a status line under it,
  // and the owl is the first thing on the page, so there is no bare paper on any side: a
  // note above has no room and flips below, onto the status line (seen on the live
  // stage). The owl is silent here until the header has somewhere to put a line.
  record: {
    place: 'above',
    arrival: null,
    occasions: [],
    keepsHours: SITES.record.keepsHours,
  },
}

/** The knob that holds a site's size, and the one for its second size. */
export const sizeKnob = (id: OwlSiteId) => `owl.embed.${id}.size`
export const sizeSmKnob = (id: OwlSiteId) => `owl.embed.${id}.sizeSm`
export const variantKnob = (id: OwlSiteId) => `owl.embed.${id}.variant`

/**
 * The custom properties a site's classes read, from its knobs. `read` is how a knob's
 * value is found — `tuneValue` in the app, a plain object in a test.
 */
export function siteVars(
  id: OwlSiteId,
  read: (knob: string) => TuneValue | undefined,
): Record<string, string> {
  const vars: Record<string, string> = {}
  const size = read(sizeKnob(id))
  const sizeSm = read(sizeSmKnob(id))
  if (size !== undefined) vars['--owl-size'] = String(size)
  if (sizeSm !== undefined) vars['--owl-size-sm'] = String(sizeSm)
  return vars
}
