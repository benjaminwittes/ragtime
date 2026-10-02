import type { RefObject } from 'react'
import { useLazy } from '../lazy'
import { layer } from './layer'
import type { OccasionId, SpeechSite } from './types'

/**
 * Where an owl's speech goes, for a placement that has chosen a voice (`useChosenVoice`).
 * It draws nothing until the speech code (`SpeechLayer.tsx`) has arrived, and then that.
 * An owl with no voice does not mount this, so the code is never fetched for it.
 */

export type SpeechLayerProps = {
  site: SpeechSite
  /** The variant the owl wears, which can name a voice of its own. */
  variant?: string
  occasion?: OccasionId | null
  /** The element a click on counts for, when it is not the box the speech sits in. */
  target?: RefObject<Element | null>
}

export function SpeechSlot(props: SpeechLayerProps) {
  const loaded = useLazy(layer)
  return loaded ? <loaded.default {...props} /> : null
}
