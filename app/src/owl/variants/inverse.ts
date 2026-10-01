import type { OwlVariant } from '../types'

/**
 * The palette turned over: a dark disc with a pale owl on it, for a ground the cream
 * disc would glare on. A look-only variant. The eyes keep their lens and pupil, which
 * are what the owl is read by, and the lantern keeps its gold.
 */
export default {
  id: 'inverse',
  label: 'Inverse',
  note: 'Palette inverted: a pale owl on a dark disc.',
  design: {
    palette: {
      cream: '#141B2E',
      navy: '#E9DFC8',
      slate: '#B8A97F',
      wing: '#CDBF9F',
      tan: '#2C3A5C',
      page: '#2A3350',
    },
  },
} satisfies OwlVariant
