import type { RefObject } from 'react'
import { OwlSpeech } from '../speech'
import { useChosenVoice } from './choice'
import { useVoiceWords } from './index'
import type { SpeechLayerProps } from './slot'
import { useOwlVoice } from './useVoice'

/**
 * Everything the owl needs in order to speak: the voice hook, the note and its stylesheet,
 * and the words of the voice it speaks in. A chunk of its own (`SpeechSlot`, `slot.tsx`
 * fetches it), because an owl with no voice — the owl as sent — has no use for any of it.
 *
 * It draws nothing until the voice's own file has arrived, and then what `useOwlVoice`
 * returns: the live region, and a note when there is a line to say. The box around the owl
 * that holds it is the placement's (`OwlSpot`), which has it from the moment a voice is
 * chosen, so the figure does not move when this arrives.
 */
export default function SpeechLayer(props: SpeechLayerProps) {
  const id = useChosenVoice(props.variant)
  const words = useVoiceWords(id)
  return words ? <Speaking {...props} /> : null
}

function Speaking({ site, variant, occasion, target }: SpeechLayerProps & { target?: RefObject<Element | null> }) {
  const voice = useOwlVoice(site, { variant, occasion })
  return voice ? <OwlSpeech voice={voice} target={target} /> : null
}
