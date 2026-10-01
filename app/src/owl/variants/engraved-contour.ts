import { ENGRAVED_PALETTE } from '../styles/engraved/inks'
import type { OwlVariant } from '../types'

/** A contour-led engraving: the lines are iso-lines of the distance to each shape's edge. */
export default {
  id: 'engraved-contour',
  label: 'Engraved: contour',
  note: 'Lines that follow the form: concentric rings on the head, face, belly and body, like a topographic map or an engraved feather. Cleaner ground, no cross-hatch.',
  design: {
    style: 'engraved',
    palette: ENGRAVED_PALETTE,
    stroke: { rim: 1.2 },
    params: {
      engraved: {
        screen: 'mixed',
        pitch: 1.4,
        contourPitch: 1.35,
        hatch: 1,
        ground: 'paper',
        keyline: 0.45,
        waver: 0.05,
      },
    },
  },
} satisfies OwlVariant
