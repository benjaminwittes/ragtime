import { ENGRAVED_PALETTE } from '../styles/engraved/inks'
import type { OwlVariant } from '../types'

/** A banknote-style engraving: displaced screen, fine pitch, cross-hatch, green ink. */
export default {
  id: 'engraved-banknote',
  label: 'Engraved: banknote',
  note: 'Green ink on pale paper. Lines bend over each form the way a banknote portrait do, with a fine cross-hatch in the shadows and a vignette ground.',
  design: {
    style: 'engraved',
    palette: { ...ENGRAVED_PALETTE, pupil: '#17382a' },
    stroke: { rim: 1.1 },
    params: {
      engraved: {
        screen: 'displaced',
        pitch: 1.15,
        displace: 4.2,
        angle: 84,
        hatch: 0.66,
        hatchAngle: 62,
        ink: '#1b3a2d',
        paper: '#eef0de',
        keyline: 0.4,
        fidelity: 'fine',
      },
    },
  },
} satisfies OwlVariant
