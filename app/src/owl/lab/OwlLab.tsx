import { useEffect, useMemo, useState, type ReactNode } from 'react'
import '../voice/voice.css'
import { DEFAULT_KNOBS } from '../styles/lines/knobs'
import type { LampState } from '../styles/lines/fields'
import { ENGRAVE_DEFAULT, type Engrave } from '../styles/lines/engrave'
import { PrintLines } from '../styles/lines/PrintLines'
import { PRINT_OFF, PRINT_ON, type Print } from '../styles/lines/print'

/**
 * The owl lab (2026-10-05): the line-tile owl as decided, and experiments from there. The first lab, a contact sheet of the flat owl, is gone.
 *
 * Ratified by Thomas going in:
 *  - `lines-owl` is the main owl; `lines-lantern` is the secondary figure, its use still open.
 *  - The owl speaks in the Typed note treatment, and what it says starts from the front
 *    page's "I am RAGtime". Its tone is not chosen, so five are set side by side.
 *  - The motion is Print: the page re-seats on the glass, the hatching breathes, the ink
 *    and the flame flicker, a light bar passes. Stepped.
 *  - The engraving is a mode of the lines owl, an effect laid on it, and not a second drawing.
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
  const [tone, setTone] = useState('records')
  const [speed, setSpeed] = useState(60)
  const [run, setRun] = useState(0)
  const [state, setState] = useState<LampState>('lit')
  const [size, setSize] = useState(240)
  const [place, setPlace] = useState<Place>('beside')
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

/* ---- 3. The engraved mode ------------------------------------------------ */

function Engraved({ print }: { print: Print }) {
  const [hatch, setHatch] = useState(ENGRAVE_DEFAULT.hatch)
  const [angle, setAngle] = useState(ENGRAVE_DEFAULT.angle)
  const [pitch, setPitch] = useState(ENGRAVE_DEFAULT.pitch)
  const [keyline, setKeyline] = useState(ENGRAVE_DEFAULT.keyline)
  const [size, setSize] = useState(280)
  const engrave = useMemo<Engrave>(() => ({ hatch, angle, pitch, keyline }), [hatch, angle, pitch, keyline])
  return (
    <>
      <H id="engraving">Engraved mode: the engraving laid on lines-owl</H>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Not a second owl: an effect on this one. An engraver works the dark of a plate twice, so the lines that already make the tone get a second
        screen cut across them at an angle where the ink is deepest, and a fine keyline holds the edge. Both come from the same ink function, so they
        follow the blink and the tilt, and Print moves them with the rest. In the app it is the setting called Engraved.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className={PAPER + ' flex flex-wrap items-end justify-center gap-10'} style={PAPER_BG}>
          <figure className="m-0">
            <PrintLines subject="c" size={size} state="lit" knobs={DEFAULT_KNOBS} print={print} />
            <Cap>Plain</Cap>
          </figure>
          <figure className="m-0">
            <PrintLines subject="c" size={size} state="lit" knobs={DEFAULT_KNOBS} print={print} engrave={engrave} />
            <Cap>Engraved</Cap>
          </figure>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <Slider label="cross-hatch reach" value={hatch} min={0} max={1} step={0.05} onChange={setHatch} />
          <Slider label="hatch angle" value={angle} min={10} max={170} step={1} onChange={setAngle} />
          <Slider label="hatch spacing" value={pitch} min={0.8} max={3} step={0.05} onChange={setPitch} />
          <Slider label="keyline width" value={keyline} min={0} max={1.2} step={0.05} onChange={setKeyline} />
          <Slider label="size" value={size} min={112} max={360} step={8} onChange={setSize} />
          <button
            type="button"
            className="w-fit text-xs underline"
            onClick={() => {
              setHatch(ENGRAVE_DEFAULT.hatch)
              setAngle(ENGRAVE_DEFAULT.angle)
              setPitch(ENGRAVE_DEFAULT.pitch)
              setKeyline(ENGRAVE_DEFAULT.keyline)
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </>
  )
}

export default function OwlLab() {
  const [print, setPrint] = useState<Print>(PRINT_ON)
  return (
    <main className="mx-auto max-w-[80rem] px-6 py-8" data-owl-lab>
      <h1 className="font-serif text-3xl font-bold">Owl lab</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        This page carries what was decided and the experiments that follow from it. Print is shared by every figure on the page, so one switch moves all of them. Moving specimens run only while they
        are on screen, and not at all under reduced motion.
      </p>
      <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Sections">
        <a className="text-primary hover:underline" href="#main">The main owl</a>
        <a className="text-primary hover:underline" href="#lantern">The lantern</a>
        <a className="text-primary hover:underline" href="#engraving">Engraved mode</a>
      </nav>
      <Hero print={print} setPrint={setPrint} />
      <Lantern print={print} />
      <Engraved print={print} />
    </main>
  )
}
