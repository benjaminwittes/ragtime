import { defineTunables } from '@/tune/registry'

/**
 * What a reader can do about the owl, from the gear in the site bar: whether it is there,
 * how much its drawing moves, and the two finishes of the line-tile drawing. These are
 * declared here, with their defaults, because the owl reads them in every build; what the gear
 * shows of each is in `panel/user.ts`, which only the gear and the tuner load. Whether it
 * *speaks* is `owl.voice.speak`, in `voice.ts`, next to the voice's other shipped knobs.
 *
 * None is a path into the design: the owl reads them through the store (`Owl.tsx`,
 * `styles/lines/Figure.tsx`).
 */

export const owlUserKnobs = defineTunables([
  {
    id: 'owl.show',
    value: true,
  },
  {
    // still, calm or lively: what the line-tile owl does with the page's own time.
    id: 'owl.lines.motion',
    value: 'calm',
  },
  {
    id: 'owl.lines.scan',
    value: true,
  },
  {
    id: 'owl.lines.bar',
    value: false,
  },
])
