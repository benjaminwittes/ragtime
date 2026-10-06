import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { UNIT_PX } from '../textLines'
import { frameAt, measureMorph, toneOf, type Measured, type MorphParams } from './engine'
import MorphArt from './MorphArt'

/**
 * Text that writes itself as lines, once, and ends as the text.
 *
 * It renders the sentence as ordinary text (it keeps its words, its selection and its place in the layout) and,
 * once it has laid the text out, draws the morph (`engine.ts`) over it as an svg and makes the real text
 * transparent (`data-lined="on"` on the host, which the host's stylesheet reads) while it plays. When the morph
 * has finished the svg is removed and the real text is all that is left, so the finished state is the real
 * thing and not a drawing of it. With no canvas, or if the reader asks for reduced motion, there is no morph:
 * the text is simply there.
 *
 * The host is this component's parent, as with `hub/LinesText.tsx`: it must be positioned, and it is where the
 * font, the size and the colour come from. The lines spacing follows the type size, so a small note has finer
 * lines and not fewer of them.
 */
export default function LineMorphText({
  text,
  params,
  pitch,
  seconds,
  onDone,
}: {
  text: string
  params: MorphParams
  /** Line spacing at the desktop title size (`measureMorph`). */
  pitch: number
  /** How long the morph takes, from nothing to the text. */
  seconds: number
  onDone?: () => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [m, setM] = useState<Measured | null>(null)
  const [textStyle, setTextStyle] = useState<CSSProperties>({})
  const [t, setT] = useState(0)
  // Reduced motion, or no time to play in: there is no morph, and the text is simply there.
  const [still] = useState(() => seconds <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [played, setPlayed] = useState(false)
  const finished = still || played
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useLayoutEffect(() => {
    const host = svg.current?.parentElement
    if (!host) return
    let raf = 0
    const draw = () => {
      const measured = measureMorph(host, pitch)
      if (!measured) return
      const cs = getComputedStyle(host)
      setTextStyle({
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        textAlign: cs.textAlign as CSSProperties['textAlign'],
        padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        whiteSpace: cs.whiteSpace,
        overflowWrap: cs.overflowWrap as CSSProperties['overflowWrap'],
        wordBreak: cs.wordBreak as CSSProperties['wordBreak'],
        textWrap: (cs as unknown as { textWrap?: string }).textWrap as CSSProperties['textWrap'],
      })
      setM(measured)
    }
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    draw()
    const ro = new ResizeObserver(later)
    ro.observe(host)
    // The face may arrive after the first layout; the words are the same but the shapes are not.
    void document.fonts?.ready.then(later)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [text, pitch])

  // Play once, as soon as there is a layout to play on. A resize or a late font re-measures and carries on from `t`.
  const ready = m !== null
  useEffect(() => {
    if (!ready || still) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / (seconds * 1000))
      setT(next)
      if (next >= 1) {
        setPlayed(true)
        done.current?.()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, still, seconds])
  useEffect(() => {
    if (still) done.current?.()
  }, [still])

  const toned = useMemo(() => (m ? toneOf(m, params.spread, params.gain) : null), [m, params.spread, params.gain])
  const frame = useMemo(() => (m && toned ? frameAt(m, toned, params, t) : null), [m, toned, params, t])

  // The real text steps aside only while the morph is there to stand in for it.
  const lined = m !== null && !finished
  useLayoutEffect(() => {
    const host = svg.current?.parentElement
    if (!host || !lined) return
    host.setAttribute('data-lined', 'on')
    return () => host.removeAttribute('data-lined')
  }, [lined])

  return (
    <>
      {text}
      <svg
        ref={svg}
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute left-0 top-0"
        width={m?.w ?? 0}
        height={m?.h ?? 0}
        viewBox={m ? `0 0 ${m.w / UNIT_PX} ${m.h / UNIT_PX}` : undefined}
        style={{ overflow: 'visible' }}
      >
        {m && frame && !finished ? <MorphArt m={m} frame={frame} text={text} textStyle={textStyle} /> : null}
      </svg>
    </>
  )
}
