import { ENGRAVED_PALETTE } from '../styles/engraved/inks'
import type { OwlVariant } from '../types'

/**
 * A clean line engraving: one ink on one paper, parallel lines that swell into the
 * shadows, a second screen across the darkest of them, a fine keyline round each form.
 */
export default {
  id: 'engraved-line',
  label: 'Engraved: line',
  note: 'A clean line engraving. Parallel lines swell into the shadows, a cross-hatch closes the darkest, a keyline holds the edge.',
  design: {
    style: 'engraved',
    palette: ENGRAVED_PALETTE,
    stroke: { rim: 1.2 },
    params: {
      engraved: {
        screen: 'straight',
      },
    },
  },
} satisfies OwlVariant
