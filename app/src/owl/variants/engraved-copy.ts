import { ENGRAVED_PALETTE } from '../styles/engraved/inks'
import type { OwlVariant } from '../types'

/** The engraved owl through the scanned-document finish. */
export default {
  id: 'engraved-copy',
  label: 'Engraved: photocopy',
  note: 'The line engraving after it has been photocopied: ink spread, edge wobble, a 1-bit clip, toner specks, a page fed in a little crooked. Standing in the print temperament: the page re-seats on the glass, the hatching breathes, a light bar passes.',
  design: {
    style: 'engraved',
    temperament: 'print',
    palette: ENGRAVED_PALETTE,
    stroke: { rim: 1.3 },
    params: {
      engraved: {
        screen: 'straight',
        scan: true,
        scanGenerations: 2,
        scanSpread: 0.17,
        scanHardness: 0.85,
        scanSkew: -1,
        scanSpeckle: 0.3,
        scanDropout: 0.25,
        scanPaperTone: '#e9e0c6',
      },
    },
  },
} satisfies OwlVariant
