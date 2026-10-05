import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { navigateTo, toLogical } from '@/lib/routing'
import './voice/voice.css'
import { fitNote } from './voice/fit'
import type { Spoken } from './voice/speaker'
import type { SiteVoice } from './voice/useVoice'
import LinesText from '@/hub/LinesText'
import { baseDesign } from './design'

/**
 * What the owl says, drawn: a note set in the owl's own world of documents, and the live
 * region that tells a screen reader the few lines that are replies.
 *
 * `voice/SpeechLayer.tsx` renders this, for `OwlSpot` and `useOwlFigure`, inside the owl's
 * positioned box when there is a voice (`useOwlVoice`), once the speech code has arrived.
 * With no voice nothing is rendered and none of this code is fetched.
 *
 * Three things are decided here, and why:
 *
 *   - **The note is `aria-hidden`; the live region is separate and mostly empty.** The owl
 *     is decoration until it has something to say. Only a line that answers something the
 *     reader just did (`OCCASIONS`, `announce`) is put in the polite live region, once,
 *     whole, and not typed out. It is `aria-live` and not `role="status"`, so the page's own
 *     status lines stay the only `status` in their container (the stage driver and
 *     `getByRole('status')` find one). An arrival, a musing after a long idle and a click are
 *     colour, and a screen reader is spared them.
 *   - **The note never takes a click.** It is `pointer-events: none`, so it cannot cover a
 *     control however it lands. It comes down by itself after its dwell, on Escape, or on a
 *     click of the owl, and it holds no focusable element, so it cannot trap focus.
 *   - **Motion is only the reveal.** Letters are typed in unless the reader has asked for
 *     reduced motion, in which case the line is simply there. The unrevealed part is laid
 *     out in invisible ink, so the note's box is its final size from the first letter.
 */

/**
 * `target` is the element a click on counts for; without one, the owl's box — the parent of
 * the live region, which is the positioned wrapper the placement made.
 */
export function OwlSpeech({ voice, target }: { voice: SiteVoice; target?: RefObject<Element | null> }) {
  const region = useRef<HTMLDivElement>(null)
  const { poke, prod, say, hold, dismiss, spoken } = voice
  const standing = spoken !== null
  // The lines treatment is the listening owl: a pointer over it speaks, a click on a spoken line
  // opens a box to type back in, and Enter carries the question to the Explorer. Off the Explorer
  // only, which reads `?q=` once, when it opens.
  const listening = voice.treatment === 'lines' && toLogical(window.location.pathname) !== '/explorer'
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    const owl = target?.current ?? region.current?.parentElement
    if (!owl) return
    const onClick = () => {
      if (!listening) return prod()
      if (typing) return
      if (standing) {
        hold()
        setTyping(true)
      }
      else say('poke')
    }
    const onEnter = (event: Event) => {
      if (listening && (event as PointerEvent).pointerType === 'mouse' && !standing && !typing) say('poke')
    }
    owl.addEventListener('click', onClick)
    owl.addEventListener('pointerenter', onEnter)
    return () => {
      owl.removeEventListener('click', onClick)
      owl.removeEventListener('pointerenter', onEnter)
    }
  }, [target, prod, say, hold, listening, standing, typing])

  // Tell the figure, which is inside the box this one sits in, that it has started to speak,
  // so a behaviour (`standing/nod.ts`) can answer with a gesture. An event on the box and
  // not a prop on the owl: the two are siblings and know each other only by that box.
  const line = spoken?.key
  useEffect(() => {
    if (line === undefined) return
    const owl = target?.current ?? region.current?.parentElement
    owl?.dispatchEvent(new CustomEvent('owl-speak'))
  }, [target, line])

  // The pointer says the owl can be clicked, only while that does something.
  useEffect(() => {
    const owl = target?.current ?? region.current?.parentElement
    if (!owl || !(poke || standing || listening)) return
    owl.setAttribute('data-voice-click', '')
    return () => owl.removeAttribute('data-voice-click')
  }, [target, poke, standing, listening])

  return (
    <>
      <div ref={region} className="owl-voice-sr" aria-live="polite" aria-atomic="true">
        {voice.announced}
      </div>
      {spoken && <Note key={spoken.key} spoken={spoken} voice={voice} />}
      {typing && <TypeBack place={voice.place} onDone={() => {
        setTyping(false)
        dismiss()
      }} />}
    </>
  )
}

/** The box the reader types back in: beside the owl, level with its middle, in its ink. */
function TypeBack({ place, onDone }: { place: SiteVoice['place']; onDone: () => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="owl-typeback"
      data-place={place === 'beside-start' ? 'beside-start' : 'beside'}
      style={{ color: baseDesign().palette.navy }}
      onSubmit={(event) => {
        event.preventDefault()
        const question = value.trim()
        if (!question) return onDone()
        onDone()
        navigateTo('/explorer?q=' + encodeURIComponent(question))
      }}
    >
      <input
        autoFocus
        value={value}
        maxLength={400}
        placeholder="Ask me anything"
        aria-label="Ask the owl a question"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone()
        }}
        onBlur={() => {
          if (!value.trim()) onDone()
        }}
      />
    </form>
  )
}

const GAP = 8
const MARGIN = 8

function Note({ spoken, voice }: { spoken: Spoken; voice: SiteVoice }) {
  const note = useRef<HTMLDivElement>(null)
  const { text } = spoken
  // The reveal starts from nothing unless it is off, or the reader asked for stillness.
  // The lines are drawn once for the whole sentence and wiped in (`voice.css`), not retyped:
  // a redraw per letter would rebuild the raster sixty times a second.
  const lined = voice.treatment === 'lines'
  const [shown, setShown] = useState(() => (lined || voice.typeMs <= 0 || stillness() ? text.length : 0))
  const typeMs = voice.typeMs

  useEffect(() => {
    if (shown >= text.length) return
    const next = setTimeout(() => setShown(shown + 1), typeMs)
    return () => clearTimeout(next)
  }, [shown, text.length, typeMs])

  // Drawn lines stand to the owl's right, level with its middle; `fitNote` still flips them when there is no room.
  const place = lined && voice.place !== 'inline' ? 'beside' : voice.place
  useLayoutEffect(() => {
    const el = note.current
    const owl = el?.parentElement
    if (!el || !owl || place === 'inline') return
    const box = el.getBoundingClientRect()
    // The box the reader types back in sits under the line, so it needs the line's height.
    owl.style.setProperty('--note-h', box.height + 'px')
    const fit = fitNote({
      place,
      anchor: owl.getBoundingClientRect(),
      note: { width: box.width, height: box.height },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      gap: GAP,
      margin: MARGIN,
    })
    el.dataset.place = fit.place
    if (fit.maxWidth !== null) el.style.setProperty('--note-max', fit.maxWidth + 'px')
    el.style.setProperty('--note-shift', fit.shift + 'px')
  }, [place])

  return (
    <div
      ref={note}
      className="owl-note"
      data-place={place}
      data-treatment={voice.treatment}
      aria-hidden="true"
      style={lined ? ({ color: baseDesign().palette.navy, '--strips-ms': stillness() ? '0ms' : '1100ms' } as React.CSSProperties) : undefined}
    >
      {lined ? (
        <>
          <LinesText text={text} pitch={3.6} photocopy={false} />
          <span className="owl-note-strips" />
        </>
      ) : (
        <>
          <span>{text.slice(0, shown)}</span>
          <span className="owl-note-rest">{text.slice(shown)}</span>
        </>
      )}
    </div>
  )
}

function stillness(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
