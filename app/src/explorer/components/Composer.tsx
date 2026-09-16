import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

type Props = {
  placeholder: string
  disabled: boolean
  /** Changes when the composer should take focus (a clarifying question arrived). */
  focusKey: number
  onSend(text: string): void
}

export function Composer({ placeholder, disabled, focusKey, onSend }: Props) {
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!disabled) box.current?.focus()
  }, [focusKey, disabled])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t || disabled) return
    setText('')
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
