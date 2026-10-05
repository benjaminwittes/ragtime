import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { mergeDesign } from '../../resolve'
import { OwlDrawing } from '../../scaffold'
import { getStyle } from '../../styles'
// The lab shows every drawing, so it has them all before the first plate is laid.
import '../../styles/all'
import { designFor, useTuneVersion } from '../../useOwlDesign'
import { variantList } from '../../variants'
import '../../voice/voice.css'
import '../lab.css'
import { DEFAULT_KNOBS } from '../lines/knobs'
import type { LampState } from '../lines/fields'
import { PrintLines } from './PrintLines'
import { PRINT_OFF, PRINT_ON, type Print } from './print'

/**
 * The owl lab, second pass (2026-10-05). The first lab is left alone at `/owl-lab`.
 *
 * Ratified by Thomas going in:
 *  - `lines-owl` is the main owl; `lines-lantern` is the secondary figure, its use still open.
 *  - The owl speaks in the Typed note treatment, and what it says starts from the front
 *    page's "I am RAGtime". Its tone is not chosen, so five are set side by side.
 *  - The temperament is Print: the page re-seats on the glass, the hatching breathes, the ink
 *    and the flame flicker, a light bar passes. Stepped.
 *  - The engraving is not dropped. A section lays it against the lines owl to find a blend.
 */

const PAPER = 'rounded-md border p-6 text-foreground'
const PAPER_BG = { background: '#fffdf2' }

const TONES: { id: string; label: string; say: string }[] = [
  { id: 'plain', label: 'Plain', say: 'I am RAGtime. Ask me anything.' },
  { id: 'records', label: 'The records', say: 'I am RAGtime. I hold tens of millions of records, and I know where each one is shelved. Ask me anything.' },
  { id: 'clerk', label: 'Dry clerk', say: 'I am RAGtime. Filed, stamped, indexed. What are you looking for?' },
  { id: 'guide', label: 'Guide', say: 'I am RAGtime. I can help you look broadly. I can help you go deep.' },
  {
    id: 'front',
    label: 'The front page, whole',
    say: 'I am RAGtime. I have tens of millions of records: litigation documents, court opinions, pardons, administrative records, rule-makings, published analyses, legislative hearings and bills, declassified records, giant catalogs of books, and hundreds of years of diplomatic history. I can help you look broadly. I can help you go deep. Ask me anything.',
  },
]

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-10 tabular-nums">{value}</span>
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Cap({ children }: { children: ReactNode }) {
  return <figcaption className="mt-1 max-w-[14rem] text-xs text-muted-foreground">{children}</figcaption>
}

function H({ children, id }: { children: ReactNode; id: string }) {
  return (
    <h2 id={id} className="mt-14 scroll-mt-16 border-b pb-2 font-serif text-2xl font-semibold">
      {children}
    </h2>
  )
}

type Place = 'below' | 'beside' | 'beside-start' | 'above' | 'inline'
const PLACES: { id: Place; label: string }[] = [
  { id: 'below', label: 'Below' },
  { id: 'beside', label: 'Beside, right' },
  { id: 'beside-start', label: 'Beside, left' },
  { id: 'above', label: 'Above' },
  { id: 'inline', label: 'In the flow, wide' },
]

/** The typed note: the real Typed-note rule from `voice.css`, set out one stepped character at a time. */
function TypedNote({ text, speed, place }: { text: string; speed: number; place: Place }) {
  const [typed, setShown] = useState(0)
  const [caret, setCaret] = useState(true)
  const shown = speed === 0 ? text.length : typed
  useEffect(() => {
    if (speed === 0) return
    const id = window.setInterval(() => setShown((n) => (n >= text.length ? n : n + 1)), 1000 / speed)
    return () => window.clearInterval(id)
  }, [text, speed])
  useEffect(() => {
    const id = window.setInterval(() => setCaret((c) => !c), 530)
    return () => window.clearInterval(id)
  }, [])
  const done = shown >= text.length
  return (
    <p className={place === 'inline' ? 'owl-note mt-4 max-w-xl' : 'owl-note'} data-treatment="typed" data-place={place} aria-label={text}>
      <span aria-hidden>{text.slice(0, shown)}</span>
      <span aria-hidden style={{ opacity: !done && caret ? 1 : done && caret ? 0.5 : 0 }}>
        {'▌'}
      </span>
    </p>
  )
}

/* ---- 1. The owl, as decided ---------------------------------------------- */

function Hero({ print, setPrint }: { print: Print; setPrint: (p: Print) => void }) {
  const [tone, setTone] = useState('plain')
  const [speed, setSpeed] = useState(28)
  const [run, setRun] = useState(0)
  const [state, setState] = useState<LampState>('lit')
  const [size, setSize] = useState(240)
  const [place, setPlace] = useState<Place>('below')
  const say = TONES.find((t) => t.id === tone)!.say
  const set = <K extends keyof Print>(k: K) => (v: Print[K]) => setPrint({ ...print, [k]: v })
  return (
    <>
      <H id="main">The main owl: lines-owl, typed, in Print</H>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        The owl sits where the hub puts it, above the line it speaks. Print is on by default: the page re-seats about six times a second, the hatching
        drifts and breathes, the ink and the flame flicker, and a light bar passes every few seconds. Everything steps; nothing is smooth.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className={PAPER} style={PAPER_BG}>
          <div className="flex min-h-[26rem] flex-col items-center justify-center py-4">
            {/* The note is placed against the owl's own box, as the real one is (`voice.css`, data-place). */}
            <div className="relative" style={{ width: size }}>
              <PrintLines subject="c" size={size} state={state} knobs={DEFAULT_KNOBS} print={print} />
              {place !== 'inline' ? <TypedNote key={`${say}${run}${speed}`} text={say} speed={speed} place={place} /> : null}
            </div>
            {place === 'inline' ? <TypedNote key={`${say}${run}${speed}`} text={say} speed={speed} place={place} /> : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">What the owl says</legend>
            {TONES.map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <input type="radio" name="tone" checked={tone === t.id} onChange={() => setTone(t.id)} />
                {t.label}
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Where the note sits</span>
            <select className="rounded border bg-background px-2 py-1 text-sm" value={place} onChange={(e) => setPlace(e.target.value as Place)}>
              {PLACES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Slider label="typing, chars/s" value={speed} min={0} max={60} step={2} onChange={setSpeed} />
          <button type="button" className="w-fit text-xs underline" onClick={() => setRun((r) => r + 1)}>
            Type it again
          </button>
          <fieldset className="mt-2 grid gap-1">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Print</legend>
            <Check label="Page re-seats, hatching drifts" checked={print.boil} onChange={set('boil')} />
            <Check label="Hatching breathes" checked={print.breath} onChange={set('breath')} />
            <Check label="Ink and flame flicker" checked={print.flicker} onChange={set('flicker')} />
            <Check label="Light bar passes" checked={print.bar} onChange={set('bar')} />
            <Check label="Scanned finish" checked={print.scan} onChange={set('scan')} />
            <Slider label="amount" value={print.amount} min={0.4} max={3} step={0.1} onChange={set('amount')} />
            <Slider label="steps/s" value={print.fps} min={4} max={24} step={1} onChange={set('fps')} />
            <Slider label="bar every, s" value={print.barEvery} min={3} max={29} step={1} onChange={set('barEvery')} />
            <div className="flex gap-3 text-xs">
              <button type="button" className="underline" onClick={() => setPrint(PRINT_ON)}>
                All on
              </button>
              <button type="button" className="underline" onClick={() => setPrint(PRINT_OFF)}>
                All off (smooth)
              </button>
            </div>
          </fieldset>
          <fieldset className="mt-2 grid gap-1">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Lantern</legend>
            {(['lit', 'searching', 'dark'] as const).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="radio" name="lamp" checked={state === s} onChange={() => setState(s)} />
                {s}
              </label>
            ))}
          </fieldset>
          <Slider label="owl size" value={size} min={112} max={320} step={8} onChange={setSize} />
        </div>
      </div>
    </>
  )
}

/* ---- 2. The lantern, secondary, use to be decided ------------------------- */

function Lantern({ print }: { print: Print }) {
  const uses: { label: string; note: string; size: number; state: LampState; moving: boolean }[] = [
    { label: 'Search in flight', note: 'Beside the search bar while a request is out: the swell pulses and sweeps.', size: 56, state: 'searching', moving: true },
    { label: 'Ready', note: 'Lit and steady, flickering in Print. The owl’s own lantern, without the owl.', size: 112, state: 'lit', moving: true },
    { label: 'Nothing found', note: 'Dark: only the lantern’s own swell is left.', size: 112, state: 'dark', moving: false },
    { label: 'Mark, 40px', note: 'As a site mark or loading glyph.', size: 40, state: 'lit', moving: false },
    { label: 'Mark, 24px', note: 'The smallest it will be asked to be. Does it still read?', size: 24, state: 'lit', moving: false },
  ]
  return (
    <>
      <H id="lantern">The lantern: lines-lantern</H>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        No owl, a lantern as a swell in a field of lines. Where it goes is still open, so here are five candidate jobs, each in the page&rsquo;s Print
        treatment. The first of them is set the way it would sit by a search bar.
      </p>
      <div className={'mt-4 flex flex-wrap items-end gap-x-10 gap-y-6 ' + PAPER} style={PAPER_BG}>
        {uses.map((u) => (
          <figure key={u.label} className="m-0">
            <PrintLines subject="lantern" size={u.size} state={u.state} knobs={DEFAULT_KNOBS} print={print} moving={u.moving} />
            <Cap>
              <strong className="text-foreground">{u.label}.</strong> {u.note}
            </Cap>
          </figure>
        ))}
      </div>
      <div className={'mt-4 ' + PAPER} style={PAPER_BG}>
        <p className="mb-3 text-xs text-muted-foreground">In place: a search bar with the lantern as its in-flight mark.</p>
        <div className="mx-auto flex max-w-xl items-center gap-3 rounded-full border bg-white px-4 py-2">
          <PrintLines subject="lantern" size={40} state="searching" knobs={DEFAULT_KNOBS} print={print} />
          <span className="font-serif italic text-muted-foreground">habeas corpus petitions, southern district, 2025</span>
        </div>
      </div>
    </>
  )
}

/* ---- 3. The engraving, kept ---------------------------------------------- */

type Mode = 'crossfade' | 'wipe' | 'overprint' | 'side'

function Plate({ variant, size }: { variant: string; size: number }) {
  const version = useTuneVersion()
  const ref = useRef<SVGSVGElement>(null)
  const design = useMemo(
    () => mergeDesign(designFor(variant), undefined),
    // The tuned values are read through the store; the version is what says they moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant, version],
  )
  return (
    <div style={{ width: size }}>
      <OwlDrawing design={design} poseId="stacks" lantern="lit" renderStyle={getStyle(design.style)} svgRef={ref} className="w-full lab-still" />
    </div>
  )
}

function Blend({ print }: { print: Print }) {
  const engraved = useMemo(() => variantList().filter((v) => v.design.style === 'engraved'), [])
  const [variant, setVariant] = useState(engraved[0]?.id ?? 'engraved-line')
  const [mode, setMode] = useState<Mode>('crossfade')
  const [mix, setMix] = useState(0.5)
  const [scale, setScale] = useState(1)
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(0)
  const S = 280
  const lines = <PrintLines subject="c" size={S} state="lit" knobs={DEFAULT_KNOBS} print={print} />
  const plate = (
    <div style={{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: 'center' }}>
      <Plate variant={variant} size={S} />
    </div>
  )
  const stack = (top: ReactNode, bottom: ReactNode, topStyle: React.CSSProperties, wrap?: React.CSSProperties) => (
    <div className="relative" style={{ width: S, height: S, ...wrap }}>
      <div className="absolute inset-0">{bottom}</div>
      <div className="absolute inset-0" style={topStyle}>
        {top}
      </div>
    </div>
  )
  const modes: Record<Mode, { label: string; note: string; view: ReactNode }> = {
    crossfade: {
      label: 'Crossfade',
      note: 'One owl dissolving into the other. Good for a state change: lines when it works, engraving when it rests.',
      view: stack(plate, lines, { opacity: mix }),
    },
    wipe: {
      label: 'Wipe',
      note: 'Engraving on the left of the line, lines on the right. Shows where the two disagree about the shape.',
      view: stack(plate, lines, { clipPath: `inset(0 ${100 - mix * 100}% 0 0)` }),
    },
    overprint: {
      label: 'Overprint',
      note: 'The engraved plate printed over the line tiles, as a second pass. The slider is the plate’s strength.',
      view: stack(plate, lines, { mixBlendMode: 'multiply', opacity: mix }),
    },
    side: {
      label: 'Side by side',
      note: 'No blend. Same size, same paper.',
      view: (
        <div className="flex gap-6">
          {lines}
          <Plate variant={variant} size={S} />
        </div>
      ),
    },
  }
  return (
    <>
      <H id="engraving">Engraving, kept: blending with lines-owl</H>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        The engraved owl is not retired. These four blends lay a real engraved variant against the lines owl so the two can be judged together. The
        engraved owl is drawn on a different frame, so use scale and offset to line them up by eye.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className={PAPER + ' flex flex-col items-center gap-3'} style={PAPER_BG}>
          <div className="overflow-x-auto py-2">{modes[mode].view}</div>
          <p className="max-w-md text-center text-xs text-muted-foreground">{modes[mode].note}</p>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Blend</legend>
            {(Object.keys(modes) as Mode[]).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="blend" checked={mode === m} onChange={() => setMode(m)} />
                {modes[m].label}
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Engraved variant</span>
            <select className="rounded border bg-background px-2 py-1 text-sm" value={variant} onChange={(e) => setVariant(e.target.value)}>
              {engraved.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <Slider label="mix" value={mix} min={0} max={1} step={0.02} onChange={setMix} />
          <Slider label="engraved scale" value={scale} min={0.7} max={1.4} step={0.01} onChange={setScale} />
          <Slider label="engraved x, px" value={dx} min={-40} max={40} step={1} onChange={setDx} />
          <Slider label="engraved y, px" value={dy} min={-40} max={40} step={1} onChange={setDy} />
          <button
            type="button"
            className="w-fit text-xs underline"
            onClick={() => {
              setScale(1)
              setDx(0)
              setDy(0)
              setMix(0.5)
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </>
  )
}

export default function OwlLabV2() {
  const [print, setPrint] = useState<Print>(PRINT_ON)
  return (
    <main className="mx-auto max-w-[80rem] px-6 py-8" data-owl-lab>
      <h1 className="font-serif text-3xl font-bold">Owl lab, v2</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        The first lab stays as it was, at <a className="text-primary hover:underline" href="./owl-lab">/owl-lab</a>. This page carries what was decided and
        experiments from there. Print is shared by every figure on the page, so one switch moves all of them. Moving specimens run only while they
        are on screen, and not at all under reduced motion.
      </p>
      <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Sections">
        <a className="text-primary hover:underline" href="#main">The main owl</a>
        <a className="text-primary hover:underline" href="#lantern">The lantern</a>
        <a className="text-primary hover:underline" href="#engraving">Engraving, kept</a>
      </nav>
      <Hero print={print} setPrint={setPrint} />
      <Lantern print={print} />
      <Blend print={print} />
    </main>
  )
}
