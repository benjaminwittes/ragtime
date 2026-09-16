import { useEffect, useRef, useState } from 'react'

import { POINT_URL } from '../config.ts'
import {
  POINT,
  cssPath,
  noteFor,
  outcomeSaid,
  quoteOf,
  sendNote,
  type PointOutcome,
} from '../model/point.ts'

type Mode = 'shut' | 'open' | 'picking'

/**
 * The pointing widget (`model/point.ts`): point at something on the page, say what is
 * wrong with it, and the note goes to the people building this rather than to the model.
 *
 * Drawn only where the build named an address, so the page's own model — a visitor with a
 * password and no tenant behind them — carries nothing. The picker listens in the capture
 * phase and swallows the click it takes, so pointing at a citation does not also open it.
 */
export function Point() {
  const [mode, setMode] = useState<Mode>('shut')
  const [note, setNote] = useState('')
  const [selector, setSelector] = useState<string | null>(null)
  const [quote, setQuote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [outline, setOutline] = useState<DOMRect | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== 'picking') return
    const mine = (target: EventTarget | null) =>
      target instanceof Node && !!root.current?.contains(target)

    const onMove = (event: MouseEvent) => {
      const target = event.target
      setOutline(target instanceof Element && !mine(target) ? target.getBoundingClientRect() : null)
    }
    const onPick = (event: MouseEvent) => {
      const target = event.target
      if (mine(target)) return
      event.preventDefault()
      event.stopPropagation()
      if (target instanceof Element) {
        setSelector(cssPath(target))
        setQuote(quoteOf(target) || null)
      }
      setMode('open')
      setOutline(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMode('open')
      setOutline(null)
    }

    const capture = { capture: true } as const
    window.addEventListener('mousemove', onMove, capture)
    window.addEventListener('click', onPick, capture)
    window.addEventListener('keydown', onKey, capture)
    return () => {
      window.removeEventListener('mousemove', onMove, capture)
      window.removeEventListener('click', onPick, capture)
      window.removeEventListener('keydown', onKey, capture)
    }
  }, [mode])

  if (!POINT_URL) return null

  function shut() {
    setMode('shut')
    setNote('')
    setSelector(null)
    setQuote(null)
    setSaid(null)
    setOutline(null)
  }

  async function send() {
    if (sending) return
    setSending(true)
    setSaid(null)
    const outcome: PointOutcome = await sendNote(
      POINT_URL,
      noteFor({ body: note, route: location.hash || location.pathname, selector, quote }),
    )
    setSending(false)
    if (outcome === 'sent') {
      setSent(true)
      setNote('')
      setSelector(null)
      setQuote(null)
      return
    }
    setSaid(outcomeSaid(outcome))
  }

  return (
    <>
      <div className="point" ref={root}>
        {mode === 'shut' ? (
          <button
            type="button"
            className="point-open"
            onClick={() => {
              setMode('open')
              setSent(false)
              setSaid(null)
            }}
          >
            {POINT.open}
          </button>
        ) : (
          <div className="point-panel" role="dialog" aria-label={POINT.title}>
            <div className="point-head">
              <strong>{POINT.title}</strong>
              <button type="button" className="point-x" onClick={shut} aria-label={POINT.close}>
                ×
              </button>
            </div>

            {sent ? (
              <>
                <p className="point-said">{POINT.sent}</p>
                <div className="point-acts">
                  <button type="button" onClick={() => setSent(false)}>
                    {POINT.again}
                  </button>
                  <button type="button" className="point-first" onClick={shut}>
                    {POINT.close}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="point-nature">{POINT.nature}</p>
                {selector === null ? (
                  <p className="point-about">{POINT.aboutPage}</p>
                ) : (
                  <div className="point-target">
                    <span className="point-sel" title={selector}>
                      {selector}
                    </span>
                    {quote !== null && <span className="point-quote">{quote}</span>}
                    <button
                      type="button"
                      className="point-x"
                      onClick={() => {
                        setSelector(null)
                        setQuote(null)
                      }}
                      aria-label={POINT.clear}
                    >
                      ×
                    </button>
                  </div>
                )}
                <textarea
                  className="point-note"
                  rows={4}
                  value={note}
                  placeholder={POINT.placeholder}
                  onChange={(e) => setNote(e.target.value)}
                />
                {said !== null && <p className="point-wrong">{said}</p>}
                <div className="point-acts">
                  <button type="button" onClick={() => setMode(mode === 'picking' ? 'open' : 'picking')}>
                    {mode === 'picking' ? POINT.picking : POINT.pick}
                  </button>
                  <button type="button" className="point-first" onClick={send} disabled={sending}>
                    {sending ? POINT.sending : POINT.send}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {outline !== null && (
        <div
          className="point-outline"
          aria-hidden="true"
          style={{
            top: outline.top,
            left: outline.left,
            width: outline.width,
            height: outline.height,
          }}
        />
      )}
    </>
  )
}
