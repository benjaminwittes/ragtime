import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

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

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t || disabled) return
    // Cleared here rather than left to the effect, so a send that is immediately followed
    // by the page closing does not restore the question that was just asked.
    setText('')
    removeLocal(DRAFT_KEY)
    onSend(t)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }
  return (
    <form className="composer" onSubmit={submit}>
      <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={placeholder} disabled={disabled} rows={2} />
      <button type="submit" className="primary" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  )
}
