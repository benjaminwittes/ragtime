import { useRef, type ReactNode } from 'react'
import { Owl } from '../Owl'
import { useChosenVoice } from './choice'
import { SpeechSlot } from './slot'
import type { SpeechSite } from './types'

/**
 * A small owl in the Explorer's conversation, as the speaker (experimental; the
 * `owl.voice.chat` knob, off by default — `Conversation.tsx` is the only caller and mounts
 * it only when that is on).
 *
 * It is a figure in a row that is already a line of text, not an embed site: the six sites
 * are places the owl lives, and this is where it is called to. It says one thing, the
 * occasion it is mounted for, and `children` is whatever the row already says — in the
 * working row, the page's own status label — which stays exactly the real status and is
 * never replaced by the owl's line. The line is set after it, in the flow (`place:
 * 'inline'`), so nothing is covered and nothing is positioned over the answer.
 *
 * With no voice the owl stands there silent, and the row is still the row.
 */
export function ChatOwl({
  occasion,
  speaks = true,
  children,
}: {
  /** What the row is: the owl is searching for `working` and dark for `answered`. */
  occasion: 'working' | 'answered'
  /** False for a row that already existed when the page was opened, which was not watched arriving. */
  speaks?: boolean
  children?: ReactNode
}) {
  const figure = useRef<HTMLSpanElement>(null)
  const site: SpeechSite = {
    place: 'inline',
    arrival: speaks ? occasion : null,
    occasions: [occasion, 'poke'],
    keepsHours: false,
  }
  const speaking = useChosenVoice() !== null
  return (
    <>
      <span ref={figure} className="owl-chat-fig">
        <Owl pose="archivist" lantern={occasion === 'working' ? 'searching' : 'dark'} />
      </span>
      {children}
      {speaking ? <SpeechSlot site={site} target={figure} /> : null}
    </>
  )
}
