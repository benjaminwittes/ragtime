import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import './voice/voice.css'
import { fitNote } from './voice/fit'
import type { Spoken } from './voice/speaker'
import type { SiteVoice } from './voice/useVoice'

/**
 * What the owl says, drawn: a note set in the owl's own world of documents, and the live
 * region that tells a screen reader the few lines that are replies.
 *
 * `OwlSpot` and `useOwlFigure` render this inside the owl's positioned box when there is a
 * voice (`useOwlVoice`), and render nothing at all when there is not.
 *
 * Three things are decided here, and why:
 *
 *   - **The note is `aria-hidden`; the live region is separate and mostly empty.** The owl
 *     is decoration until it has something to say. Only a line that answers something the
 *     reader just did (`OCCASIONS`, `announce`) is put in the polite `role="status"` region,
 *     once, whole, and not typed out. An arrival, a musing after a long idle and a click are
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
  const { poke, prod, spoken } = voice
  const standing = spoken !== null

  useEffect(() => {
    const owl = target?.current ?? region.current?.parentElement
    if (!owl) return
    const onClick = () => prod()
    owl.addEventListener('click', onClick)
    return () => owl.removeEventListener('click', onClick)
  }, [target, prod])

  // The pointer says the owl can be clicked, only while that does something.
  useEffect(() => {
    const owl = target?.current ?? region.current?.parentElement
    if (!owl || !(poke || standing)) return
    owl.setAttribute('data-voice-click', '')
    return () => owl.removeAttribute('data-voice-click')
  }, [target, poke, standing])

  return (
    <>
      <div ref={region} className="owl-voice-sr" role="status">
        {voice.announced}
      </div>
      {spoken && <Note key={spoken.key} spoken={spoken} voice={voice} />}
    </>
  )
}

const GAP = 8
const MARGIN = 8

function Note({ spoken, voice }: { spoken: Spoken; voice: SiteVoice }) {
  const note = useRef<HTMLDivElement>(null)
  const { text } = spoken
  // The reveal starts from nothing unless it is off, or the reader asked for stillness.
  const [shown, setShown] = useState(() => (voice.typeMs <= 0 || stillness() ? text.length : 0))
  const typeMs = voice.typeMs

  useEffect(() => {
    if (shown >= text.length) return
    const next = setTimeout(() => setShown(shown + 1), typeMs)
    return () => clearTimeout(next)
  }, [shown, text.length, typeMs])

  const place = voice.place
  useLayoutEffect(() => {
    const el = note.current
    const owl = el?.parentElement
    if (!el || !owl || place === 'inline') return
    const box = el.getBoundingClientRect()
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
    <div ref={note} className="owl-note" data-place={place} data-treatment={voice.treatment} aria-hidden="true">
      <span>{text.slice(0, shown)}</span>
      <span className="owl-note-rest">{text.slice(shown)}</span>
    </div>
  )
}

function stillness(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
