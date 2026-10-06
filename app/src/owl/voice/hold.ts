import { createContext } from 'react'
import type { OccasionId } from './types'

/**
 * For the lab: hold a line on screen instead of waiting for an occasion. Everything under
 * a provider speaks one chosen voice's line for one chosen occasion, and keeps it there, so the placements of all six embed sites can be looked at
 * together, in the real markup each site uses. `occasion: 'arrival'` is each site's own
 * arrival line. A site that cannot truthfully report the occasion holds nothing.
 *
 * No page provides this, so on the site it is `null` and `useOwlVoice` behaves as normal.
 */
export type Hold = {
  voice: string
  occasion: OccasionId | 'arrival'
}

export const VoiceHold = createContext<Hold | null>(null)
