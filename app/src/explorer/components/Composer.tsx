import { useEffect, useRef, useState } from 'react'

import { AskBox } from '@/components/AskBox'

import { DRAFT_KEY } from '../model/persist.ts'
import { readLocal, removeLocal, writeLocal } from '../storage.ts'

type Props = {
  placeholder: string
  disabled: boolean
  /** Changes when the composer should take focus (a clarifying question arrived). */
  focusKey: number
  onSend(text: string): void
}

/**
 * The composer, and the one thing in it worth keeping: what you had typed.
 *
 * A question half-written is the most expensive thing on this page to lose, because it is
 * the only thing here the reader made rather than the machine. It survives on its own key
 * rather than inside the conversation blob — it changes on every keystroke and the
 * conversation does not, so sharing a key would rewrite every turn to record one letter.
 *
 * That draft, the focus rule and the order of the two things a send does are what is left
 * here. The box itself is {@link AskBox}, which the hub's search is the other skin of: the
 * form, the guard against sending nothing, and Enter-sends/Shift+Enter-newlines were
 * written once on each surface and are now written once. The `.composer` class names go
 * down as props, because `explorer.css` still styles this skin and nothing of the app's
 * kit may cross into `.explorer`.
 */
export function Composer({ placeholder, disabled, focusKey, onSend }: Props) {
  const [text, setText] = useState(() => readLocal(DRAFT_KEY) ?? '')
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!disabled) box.current?.focus()
  }, [focusKey, disabled])

  // Written as it is typed. This is one short string, so there is nothing to debounce for;
  // the reason the conversation is not written this way is its size, not its frequency.
  useEffect(() => {
    if (text) writeLocal(DRAFT_KEY, text)
    else removeLocal(DRAFT_KEY)
  }, [text])

  // Reached only through AskBox's guard, so there is nothing to check here that has not
  // been checked: the trim-and-refuse-empty rule and the disabled rule are the box's.
  const send = () => {
    const t = text.trim()
    // Cleared here rather than left to the effect, so a send that is immediately followed
    // by the page closing does not restore the question that was just asked. The order is
    // the point and survives the move into AskBox: clear, forget the draft, then send.
    setText('')
    removeLocal(DRAFT_KEY)
    onSend(t)
  }
  return (
    <AskBox
      as="textarea"
      className="composer"
      fieldRef={box}
      value={text}
      onChange={setText}
      onSubmit={send}
      placeholder={placeholder}
      disabled={disabled}
      rows={2}
      submitLabel="Send"
      submitClassName="primary"
    />
  )
}
