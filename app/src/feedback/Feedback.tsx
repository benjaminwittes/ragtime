import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquareIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { toLogical } from '@/lib/routing'

import { POINT_URL, POINT_WIRE } from './config.ts'
import {
  POINT,
  cssPath,
  feedbackRequested,
  noteFor,
  outcomeSaid,
  pageAddress,
  quoteOf,
  sendNote,
  surfaceFor,
  type PointOutcome,
} from './point.ts'

type Mode = 'shut' | 'open' | 'picking'

/**
 * The feedback control (`point.ts`): say what is wrong, optionally point at the thing you
 * mean, and the note goes to the people building this rather than to the model.
 *
 * It lives in the site bar, beside the docs and AI access, because it is the same kind of
 * thing they are — about the reader rather than about the page — and because the bar is
 * the one strip no surface draws over. In its first life this was a pill on the Explorer's
 * right edge, and before that in the corner, where it sat on top of Send.
 *
 * The bar scrolls away with the page everywhere but the Explorer, and the moment a reader
 * wants this is usually forty results down. So when the bar's button has left the screen
 * a second one appears in the bottom corner, which every scrolling surface leaves empty.
 * It cannot appear on the Explorer: that route is a fixed column and its bar never leaves.
 *
 * The panel is rendered into the body, not the bar. The bar carries a view transition
 * name, which makes it a stacking context of its own, and a panel inside it would be
 * layered against the page by the bar's order rather than by its own.
 *
 * The picker listens in the capture phase and swallows the click it takes, so pointing at
 * a citation does not also open it.
 */
export function Feedback() {
  const [mode, setMode] = useState<Mode>(() =>
    feedbackRequested(window.location.search) ? 'open' : 'shut',
  )
  const [note, setNote] = useState('')
  const [email, setEmail] = useState('')
  const [selector, setSelector] = useState<string | null>(null)
  const [quote, setQuote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [outline, setOutline] = useState<DOMRect | null>(null)
  const [barGone, setBarGone] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const inBar = useRef<HTMLButtonElement>(null)
  const afloat = useRef<HTMLButtonElement>(null)
  const words = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = inBar.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const seen = new IntersectionObserver(([entry]) => setBarGone(!entry.isIntersecting))
    seen.observe(el)
    return () => seen.disconnect()
  }, [])

  useEffect(() => {
    if (mode === 'open' && !sent) words.current?.focus()
  }, [mode, sent])

  useEffect(() => {
    if (mode === 'shut') return
    const mine = (target: EventTarget | null) =>
      target instanceof Node &&
      (!!panel.current?.contains(target) ||
        !!inBar.current?.contains(target) ||
        !!afloat.current?.contains(target))

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
    // Escape steps back one state: out of picking into the panel, out of the panel to
    // nothing. Only while the panel has the focus, for the second — a reader who opened
    // it and then went back to the page should not lose a half-written note to a key
    // that page also uses.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (mode === 'picking') {
        event.preventDefault()
        setMode('open')
        setOutline(null)
      } else if (mine(event.target)) {
        setMode('shut')
      }
    }

    const capture = { capture: true } as const
    if (mode === 'picking') {
      window.addEventListener('mousemove', onMove, capture)
      window.addEventListener('click', onPick, capture)
    }
    window.addEventListener('keydown', onKey, capture)
    return () => {
      window.removeEventListener('mousemove', onMove, capture)
      window.removeEventListener('click', onPick, capture)
      window.removeEventListener('keydown', onKey, capture)
    }
  }, [mode])

  function open() {
    setMode('open')
    setSent(false)
    setSaid(null)
  }

  // Shutting keeps what was written. The panel is one click from a results list and one
  // click back, and a reader who closes it to check the thing they are describing should
  // find their sentence where they left it. Sending is what clears it.
  function shut() {
    setMode('shut')
    setSaid(null)
    setOutline(null)
  }

  async function send() {
    if (sending) return
    setSending(true)
    setSaid(null)
    const pathname = toLogical(window.location.pathname)
    const outcome: PointOutcome = await sendNote(
      POINT_URL,
      noteFor({
        surface: surfaceFor(pathname),
        body: note,
        route: pageAddress(pathname, window.location.search),
        selector,
        quote,
        email,
      }),
      POINT_WIRE,
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

  const toggle = () => (mode === 'shut' ? open() : shut())

  return (
    <>
      <Button
        ref={inBar}
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-label={POINT.title}
        aria-haspopup="dialog"
        aria-expanded={mode !== 'shut'}
        data-feedback="open"
      >
        {/* The word goes at phone width and the glyph stays, as the docs button beside
            this one does: 390px is where the bar runs out of row. */}
        <MessageSquareIcon aria-hidden="true" />
        <span className="hidden sm:inline">{POINT.open}</span>
      </Button>

      {createPortal(
        <>
          {barGone && mode === 'shut' && (
            <button
              ref={afloat}
              type="button"
              onClick={open}
              aria-label={POINT.title}
              data-feedback="afloat"
              className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-lawfare-line-strong bg-card px-3.5 py-2 text-[13px] text-lawfare-text-secondary shadow-md hover:text-foreground"
            >
              <MessageSquareIcon aria-hidden="true" className="size-3.5" />
              {POINT.open}
            </button>
          )}

          {mode !== 'shut' && (
            <div
              ref={panel}
              role="dialog"
              aria-label={POINT.title}
              data-feedback="panel"
              // Under the bar while the bar is on screen, and at the top of the window
              // once it has scrolled away — the same corner either way, so the panel does
              // not jump when a reader scrolls with it open.
              style={{ top: barGone ? '0.75rem' : 'calc(var(--site-bar-h, 3.5rem) + 0.5rem)' }}
              className="fixed right-3 z-50 grid max-h-[calc(100dvh-1.5rem)] w-[min(22rem,calc(100vw-1.5rem))] content-start gap-2.5 overflow-y-auto rounded-lg border border-lawfare-line-strong bg-card p-3.5 text-sm text-foreground shadow-lg"
            >
              <div className="flex items-baseline justify-between">
                <strong className="font-serif text-base">{POINT.title}</strong>
                <button
                  type="button"
                  onClick={shut}
                  aria-label={POINT.close}
                  className="px-0.5 text-lg leading-none text-lawfare-muted hover:text-foreground"
                >
                  ×
                </button>
              </div>

              {sent ? (
                <>
                  <p role="status">{POINT.sent}</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSent(false)}>
                      {POINT.again}
                    </Button>
                    <Button size="sm" onClick={shut}>
                      {POINT.close}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-lawfare-text-secondary">{POINT.nature}</p>
                  {selector === null ? (
                    <p className="text-xs text-lawfare-text-secondary">{POINT.aboutPage}</p>
                  ) : (
                    <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 border-l-2 border-lawfare-line pl-2.5">
                      <span
                        className="truncate font-mono text-[11px] text-lawfare-muted"
                        title={selector}
                      >
                        {selector}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelector(null)
                          setQuote(null)
                        }}
                        aria-label={POINT.clear}
                        className="row-span-2 self-start px-0.5 text-lg leading-none text-lawfare-muted hover:text-foreground"
                      >
                        ×
                      </button>
                      {quote !== null && (
                        <span className="line-clamp-3 text-xs text-lawfare-text-secondary">
                          {quote}
                        </span>
                      )}
                    </div>
                  )}
                  <textarea
                    ref={words}
                    rows={4}
                    value={note}
                    placeholder={POINT.placeholder}
                    aria-label={POINT.placeholder}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full resize-y rounded-md border border-lawfare-line-strong bg-background p-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <input
                    type="email"
                    value={email}
                    placeholder={POINT.reply}
                    aria-label={POINT.reply}
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-lawfare-line-strong bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  {said !== null && (
                    <p role="alert" className="text-xs text-destructive">
                      {said}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMode(mode === 'picking' ? 'open' : 'picking')}
                    >
                      {mode === 'picking' ? POINT.picking : POINT.pick}
                    </Button>
                    <Button size="sm" onClick={send} disabled={sending}>
                      {sending ? POINT.sending : POINT.send}
                    </Button>
                  </div>
                  <p className="text-[11px] text-lawfare-muted">{POINT.carries}</p>
                </>
              )}
            </div>
          )}

          {outline !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[49] rounded-md border-2 border-primary"
              style={{
                top: outline.top,
                left: outline.left,
                width: outline.width,
                height: outline.height,
              }}
            />
          )}
        </>,
        document.body,
      )}
    </>
  )
}
