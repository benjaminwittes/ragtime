import type { OwlDesign } from '../../types'

/**
 * The palette the engraved variants share. In a line print a colour is not a colour but a
 * weight of ink: each entry's luminance is the tone its shape is printed at, so these are
 * greys, chosen to make the owl read dark body, lighter face, pale belly, white pages.
 * The eyes and rims are recoloured to the ink and the paper by `engraved.css`, so the
 * `lens`, `gold` and `pupil` entries only matter to the glow and the beak's tone.
 */
export const ENGRAVED_PALETTE: OwlDesign['palette'] = {
  navy: '#807b73',
  cream: '#f4eee0',
  slate: '#bdb8b0',
  wing: '#7f7a72',
  tan: '#dcd6cb',
  gold: '#b8b2a6',
  lens: '#f4eee0',
  flame: '#f4eee0',
  page: '#ffffff',
  pupil: '#17140f',
}
