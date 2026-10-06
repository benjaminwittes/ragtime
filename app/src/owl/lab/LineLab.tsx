import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { linesFromGrid, UNIT_PX } from '@/hub/textLines'
import { frameAt, geometry, measureMorph, rowTimes, timing, toneOf, type Measured, type MorphParams } from '@/hub/lineMorph/engine'
import MorphArt from '@/hub/lineMorph/MorphArt'
import { getTunable } from '@/tune/registry'
import '../knobs/morph'

/**
 * The line compositing builder (2026-10-06), shown as a node graph. It is not a real node engine: the graph is
 * fixed and each card is one stage whose output you can see on its own. Final is the line morph itself
 * (`hub/lineMorph/`), the same code the owl's words are written with, so what is tuned here is what ships.
 *
 *   Lines ──┬→ Windowed Lines ─┬→ Masked Text
 *   Window ─┘        ▲         │
 *   Text ────────────┼─────────┘                 (the wires are drawn on the page)
 *     │              │
 *     └──────────────┴→ Halftone Lines ──→ Final
 *
 * Final: flat lines in a window crossing the text, a halftone swelling on them, then the original text. One
 * master timeline `t` (0 → 1) plays it; scrub it or let it play and loop. The values the effect shares with the
 * owl (`owl/knobs/morph.ts`) are written back there by "Write to source"; the lab's own are written to this file.
 */

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-10 text-right tabular-nums">{value}</span>
    </label>
  )
}

/** One card of the graph: a title, what it reads from, its controls, and a preview of its output. */
function Card({ title, kind, from, preview, children }: { title: string; kind: 'input' | 'mask' | 'combine' | 'output'; from?: string[]; preview: ReactNode; children?: ReactNode }) {
  const tint = { input: 'bg-emerald-600', mask: 'bg-amber-600', combine: 'bg-sky-600', output: 'bg-violet-700' }[kind]
  return (
    <div className="flex w-[17rem] shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm" data-node={title}>
      <header className={`flex items-center justify-between px-3 py-1.5 text-xs font-medium text-white ${tint}`}>
        <span>{title}</span>
        <span className="opacity-80">{kind}</span>
      </header>
      {from?.length ? <div className="border-b px-3 py-1 text-[11px] text-muted-foreground">in: {from.join(' + ')}</div> : null}
      <div className="flex flex-col gap-1.5 px-3 py-2">{children}</div>
      <div className="mt-auto border-t bg-muted/30 p-2">{preview}</div>
    </div>
  )
}

function Column({ children, top }: { children: ReactNode; top?: boolean }) {
  return <div className={`relative z-10 flex shrink-0 flex-col gap-4 ${top ? 'justify-start' : 'justify-center'}`}>{children}</div>
}

/** A scaled-down SVG of one stage's output, on the paper colour. */
function Shot({ m, paper, children }: { m: Measured | null; paper: string; children: ReactNode }) {
  if (!m) return <div className="h-16" />
  return (
    <svg viewBox={`0 0 ${m.w / UNIT_PX} ${m.h / UNIT_PX}`} className="block w-full rounded border" style={{ background: paper }} aria-hidden="true">
      {children}
    </svg>
  )
}

/**
 * The lab's own variables as they sit in source. One declaration per line, `{ id, value }`, the shape the dev
 * server's write-to-source endpoint patches in place (`app/vite-plugin-tune.ts`).
 */
const KNOBS = {
  text: { id: 'line-lab.text', value: 'I am RAGtime' },
  size: { id: 'line-lab.size', value: 66 },
  weight: { id: 'line-lab.weight', value: 500 },
  ink: { id: 'line-lab.ink', value: '#1b2a49' },
  paper: { id: 'line-lab.paper', value: '#fffdf2' },
  windowOn: { id: 'line-lab.windowOn', value: true },
  t: { id: 'line-lab.t', value: 0.5637846153846028 },
  loop: { id: 'line-lab.loop', value: true },
  blend: { id: 'line-lab.blend', value: 'through' },
}

/** The values the effect shares with the owl, by their name here and their knob (`owl/knobs/morph.ts`). */
const SHARED = {
  speed: 'owl.morph.speed',
  pitch: 'owl.morph.pitch',
  cover: 'owl.morph.cover',
  winWidth: 'owl.morph.window',
  spread: 'owl.morph.spread',
  gain: 'owl.morph.gain',
  ramp: 'owl.morph.ramp',
  shift: 'owl.morph.shift',
  trail: 'owl.morph.trail',
  entry: 'owl.morph.entry',
  pieces: 'owl.morph.pieces',
  stagger: 'owl.morph.stagger',
} as const
const SHARED_FILE = 'src/owl/knobs/morph.ts'
const SELF_FILE = 'src/owl/lab/LineLab.tsx'

type LabKey = keyof typeof KNOBS
type SharedKey = keyof typeof SHARED
type Value = string | number | boolean
const sharedDefault = (k: SharedKey) => getTunable(SHARED[k])?.value as number

export default function LineLab() {
  const [text, setText] = useState(KNOBS.text.value)
  const [size, setSize] = useState(KNOBS.size.value)
  const [weight, setWeight] = useState(KNOBS.weight.value)
  const [ink, setInk] = useState(KNOBS.ink.value)
  const [paper, setPaper] = useState(KNOBS.paper.value)
  const [windowOn, setWindowOn] = useState(KNOBS.windowOn.value)
  const [t, setT] = useState(KNOBS.t.value)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(KNOBS.loop.value)
  const [blend, setBlend] = useState(KNOBS.blend.value as 'over' | 'through' | 'outside')
  const [speed, setSpeed] = useState(() => sharedDefault('speed'))
  const [pitch, setPitch] = useState(() => sharedDefault('pitch'))
  const [cover, setCover] = useState(() => sharedDefault('cover'))
  const [winWidth, setWinWidth] = useState(() => sharedDefault('winWidth'))
  const [spread, setSpread] = useState(() => sharedDefault('spread'))
  const [gain, setGain] = useState(() => sharedDefault('gain'))
  const [ramp, setRamp] = useState(() => sharedDefault('ramp'))
  const [shift, setShift] = useState(() => sharedDefault('shift'))
  const [trail, setTrail] = useState(() => sharedDefault('trail'))
  const [entry, setEntry] = useState(() => sharedDefault('entry'))
  const [pieces, setPieces] = useState(() => sharedDefault('pieces'))
  const [stagger, setStagger] = useState(() => sharedDefault('stagger'))
  const [note, setNote] = useState('')

  const lab: Record<LabKey, Value> = { text, size, weight, ink, paper, windowOn, t, loop, blend }
  const shared: Record<SharedKey, number> = { speed, pitch, cover, winWidth, spread, gain, ramp, shift, trail, entry, pieces, stagger }
  const moved = [
    ...(Object.keys(KNOBS) as LabKey[]).filter((k) => lab[k] !== KNOBS[k].value),
    ...(Object.keys(SHARED) as SharedKey[]).filter((k) => shared[k] !== sharedDefault(k)),
  ]
  const resetAll = () => {
    setText(KNOBS.text.value); setSize(KNOBS.size.value); setWeight(KNOBS.weight.value); setInk(KNOBS.ink.value); setPaper(KNOBS.paper.value)
    setWindowOn(KNOBS.windowOn.value); setT(KNOBS.t.value); setLoop(KNOBS.loop.value); setBlend(KNOBS.blend.value as 'over' | 'through' | 'outside')
    setSpeed(sharedDefault('speed')); setPitch(sharedDefault('pitch')); setCover(sharedDefault('cover')); setWinWidth(sharedDefault('winWidth'))
    setSpread(sharedDefault('spread')); setGain(sharedDefault('gain')); setRamp(sharedDefault('ramp')); setShift(sharedDefault('shift'))
    setTrail(sharedDefault('trail')); setEntry(sharedDefault('entry')); setPieces(sharedDefault('pieces')); setStagger(sharedDefault('stagger'))
    setNote('reset to what is in source')
  }
  const writeToSource = async () => {
    if (!moved.length) return setNote('nothing moved')
    const edits = moved.map((k) =>
      k in SHARED
        ? { kind: 'value', id: SHARED[k as SharedKey], file: SHARED_FILE, value: shared[k as SharedKey] }
        : { kind: 'value', id: KNOBS[k as LabKey].id, file: SELF_FILE, value: lab[k as LabKey] },
    )
    try {
      const response = await fetch('/__tune/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edits }) })
      if (!response.ok) return setNote(`write failed: ${await response.text()}`)
      const { results } = (await response.json()) as { results: { id: string; ok: boolean; detail: string }[] }
      const bad = results.filter((r) => !r.ok)
      setNote(bad.length ? `wrote ${results.length - bad.length}, failed: ${bad.map((r) => r.id).join(', ')}` : `wrote ${results.length}: the owl's knobs in ${SHARED_FILE}, the lab's own here`)
    } catch (error) {
      setNote(`write failed: ${error instanceof Error ? error.message : 'no dev server'}`)
    }
  }
  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify({ ...lab, ...shared }, null, 2))
    setNote('all values copied as JSON')
  }

  const graph = useRef<HTMLDivElement>(null)
  const [wires, setWires] = useState<{ d: string; key: string }[]>([])
  const [wireBox, setWireBox] = useState({ w: 0, h: 0 })

  const uid = useId().replace(/:/g, '')
  const host = useRef<HTMLDivElement>(null)
  const [m, setM] = useState<Measured | null>(null)

  // The text as the face lays it out: the engine's raster, letters and rows.
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    let raf = 0
    const draw = () => setM(measureMorph(el, pitch))
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    draw()
    void document.fonts?.ready.then(later)
    return () => cancelAnimationFrame(raf)
  }, [text, size, weight, pitch])

  const params: MorphParams = useMemo(
    () => ({ cover, winWidth, windowOn, spread, gain, ramp, shift, trail, entry, speed, pieces, stagger }),
    [cover, winWidth, windowOn, spread, gain, ramp, shift, trail, entry, speed, pieces, stagger],
  )
  const toned = useMemo(() => (m ? toneOf(m, spread, gain) : null), [m, spread, gain])
  // Final, as the owl draws it: one frame of the engine at the master time.
  const frame = useMemo(() => (m && toned ? frameAt(m, toned, params, t) : null), [m, toned, params, t])
  // How long the whole takes at the one swipe speed, for this text.
  const tm = useMemo(() => (m ? timing(m, params) : null), [m, params])
  const total = tm?.total ?? 1
  // The window's place, for the previews of the stages before Final (the first row's, which is the only one of a single line).
  const geo = useMemo(() => {
    if (!m || !tm) return null
    const wordEnd = m.letters.reduce((e, lt) => (lt && lt.row === 0 ? Math.max(e, lt.r) : e), 0)
    return geometry(wordEnd, params, m.size, rowTimes(tm, t * tm.total)[0])
  }, [m, tm, params, t])
  const lo = m && geo ? geo.loPx / m.w : 0
  const hi = m && geo ? geo.hiPx / m.w : 0
  const vw = m ? m.w / UNIT_PX : 0
  const vh = m ? m.h / UNIT_PX : 0
  const win = `${uid}-win`
  const inWords = `${uid}-in`
  const outWords = `${uid}-out`

  // The flat lines of the Lines stage, and the halftone of the Halftone Lines stage.
  const band = useMemo(() => (m ? linesFromGrid({ ...m.grid, data: new Float32Array(m.grid.data.length).fill(cover) }, m.spacing) : ''), [m, cover])
  const halftone = useMemo(() => (m && toned ? linesFromGrid({ w: m.w, h: m.h, data: toned }, m.spacing) : ''), [m, toned])

  // Auto-play: advance t with the clock, hold a beat at the end, then loop or stop.
  const tRef = useRef(t)
  useLayoutEffect(() => {
    tRef.current = t
  }, [t])
  useLayoutEffect(() => {
    if (!playing) return
    let raf = 0
    let prev = performance.now()
    let holdUntil = 0
    const tick = (now: number) => {
      const dt = now - prev
      prev = now
      if (holdUntil) {
        if (now >= holdUntil) {
          holdUntil = 0
          setT(0)
        }
      } else {
        const next = tRef.current + dt / (total * 1000)
        if (next >= 1) {
          setT(1)
          if (loop) holdUntil = now + 700
          else {
            setPlaying(false)
            return
          }
        } else setT(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, loop, total])

  // The wires between cards, measured from where the cards actually sit.
  useLayoutEffect(() => {
    const root = graph.current
    if (!root) return
    const EDGES: [string, string][] = [
      ['Lines', 'Windowed Lines'],
      ['Window', 'Windowed Lines'],
      ['Windowed Lines', 'Masked Text'],
      ['Text', 'Masked Text'],
      ['Lines', 'Halftone Lines'],
      ['Text', 'Halftone Lines'],
      ['Halftone Lines', 'Final: reveal'],
      ['Lines', 'Final: reveal'],
      ['Text', 'Final: reveal'],
      ['Window', 'Final: reveal'],
    ]
    const measure = () => {
      const box = root.getBoundingClientRect()
      const at = (name: string) => root.querySelector(`[data-node="${name}"]`)?.getBoundingClientRect()
      const incoming: Record<string, number> = {}
      const total: Record<string, number> = {}
      EDGES.forEach(([, to]) => (total[to] = (total[to] ?? 0) + 1))
      const next: { d: string; key: string }[] = []
      for (const [from, to] of EDGES) {
        const a = at(from)
        const b = at(to)
        if (!a || !b) continue
        const k = (incoming[to] = (incoming[to] ?? -1) + 1)
        const x1 = a.right - box.left
        const y1 = a.top + a.height / 2 - box.top
        const x2 = b.left - box.left
        const y2 = b.top + 24 + (k * Math.min(b.height - 48, 120)) / Math.max(1, total[to] - 1) - box.top
        const c = Math.max(24, (x2 - x1) / 2)
        next.push({ key: `${from}>${to}`, d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}` })
      }
      setWires(next)
      setWireBox({ w: box.width, h: box.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    root.querySelectorAll('[data-node]').forEach((n) => ro.observe(n))
    return () => ro.disconnect()
  }, [m])

  const defs = (
    <defs>
      <clipPath id={win}>
        <rect x={vw * lo} y={0} width={vw * (hi - lo)} height={vh} />
      </clipPath>
      {m ? (
        <>
          <mask id={inWords} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <path d={band} fill="#fff" clipPath={windowOn ? `url(#${win})` : undefined} />
          </mask>
          <mask id={outWords} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <rect x={0} y={0} width={vw} height={vh} fill="#fff" />
            <path d={band} fill="#000" clipPath={windowOn ? `url(#${win})` : undefined} />
          </mask>
        </>
      ) : null}
    </defs>
  )
  // What Windowed Lines passes on: the lines inside the window, or all of them when the window is bypassed.
  const maskedBand = m ? <path d={band} fill={ink} clipPath={windowOn ? `url(#${win})` : undefined} /> : null

  // The face the words are set in, here and in Final: the same box the engine measured.
  const textStyle: CSSProperties = { fontFamily: 'Lato, sans-serif', fontSize: size, fontWeight: weight, lineHeight: 1.25, whiteSpace: 'pre-line' }
  const plain = m ? (
    <foreignObject x={0} y={0} width={m.w} height={m.h} transform={`scale(${1 / UNIT_PX})`} style={{ overflow: 'visible' }}>
      <div style={{ ...textStyle, color: ink, boxSizing: 'border-box', width: m.w }}>{text}</div>
    </foreignObject>
  ) : null

  // Masked Text: the Windowed Lines are the mask and the text is what shows through them.
  const composite = m ? (
    blend === 'over' ? (
      <>
        {plain}
        {maskedBand}
      </>
    ) : (
      <g mask={`url(#${blend === 'through' ? inWords : outWords})`}>{plain}</g>
    )
  ) : null

  return (
    <main className="mx-auto max-w-[110rem] px-6 py-8" data-line-lab>
      <h1 className="text-lg font-semibold">Line compositing builder</h1>
      <p className="mb-6 text-sm text-muted-foreground">Read left to right. Each card shows what that stage outputs. Scrub the timeline or press play.</p>

      <div className="sticky top-2 z-20 mb-6 flex flex-wrap items-center gap-4 rounded-lg border bg-background/95 px-4 py-2 shadow-sm backdrop-blur" data-timeline>
        <button
          type="button"
          onClick={() => {
            if (!playing && t >= 1) setT(0)
            setPlaying(!playing)
          }}
          className="w-16 rounded border px-2 py-1 text-sm font-medium"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          aria-label="timeline"
          min={0}
          max={1}
          step={0.001}
          value={t}
          onPointerDown={() => setPlaying(false)}
          onChange={(e) => setT(Number(e.target.value))}
          className="min-w-[16rem] flex-1"
        />
        <span className="w-28 text-xs tabular-nums text-muted-foreground">{(t * total).toFixed(1)}s / {total.toFixed(1)}s</span>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          loop
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">speed</span>
          <input type="range" min={2} max={40} step={0.5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-28" />
          <span className="w-16 tabular-nums">{speed} em/s</span>
        </label>
        <span className="mx-1 h-6 w-px bg-border" />
        <span className="text-xs text-muted-foreground" data-moved>{moved.length ? `${moved.length} moved: ${moved.join(', ')}` : 'matches source'}</span>
        <button type="button" onClick={() => void writeToSource()} disabled={!moved.length} className="rounded border px-2 py-1 text-xs font-medium disabled:opacity-40">
          Write to source
        </button>
        <button type="button" onClick={resetAll} disabled={!moved.length} className="rounded border px-2 py-1 text-xs disabled:opacity-40">
          Reset to source
        </button>
        <button type="button" onClick={copyJson} className="rounded border px-2 py-1 text-xs">
          Copy JSON
        </button>
        {note ? <span className="text-xs text-muted-foreground" data-note>{note}</span> : null}
      </div>

      {/* The words are measured here, off screen. The Text node shows the plain words. */}
      <div
        ref={host}
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] top-0 inline-block"
        style={{ ...textStyle, color: ink }}
      >
        {text}
      </div>

      <div className="overflow-x-auto pb-4">
      <div ref={graph} className="relative flex items-stretch gap-20">
        <svg className="pointer-events-none absolute left-0 top-0 z-0" width={wireBox.w} height={wireBox.h} aria-hidden="true">
          <defs>
            <marker id={`${uid}-ah`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#8a8f98" />
            </marker>
          </defs>
          {wires.map((w) => (
            <path key={w.key} d={w.d} fill="none" stroke="#8a8f98" strokeWidth={1.5} markerEnd={`url(#${uid}-ah)`} />
          ))}
        </svg>
        <Column>
          <Card
            title="Lines"
            kind="input"
            preview={
              <Shot m={m} paper={paper}>
                {m ? <path d={band} fill={ink} /> : null}
              </Shot>
            }
          >
            <Slider label="line pitch" value={pitch} min={1.5} max={12} step={0.1} onChange={setPitch} />
            <Slider label="weight" value={cover} min={0.05} max={1} step={0.05} onChange={setCover} />
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">ink / paper</span>
              <input type="color" value={ink} onChange={(e) => setInk(e.target.value)} />
              <input type="color" value={paper} onChange={(e) => setPaper(e.target.value)} />
            </label>
          </Card>
          <Card
            title="Window"
            kind="input"
            preview={
              <Shot m={m} paper={paper}>
                <rect x={0} y={0} width={vw} height={vh} fill="#000" opacity={0.08} />
                {windowOn ? <rect x={vw * lo} y={0} width={vw * (hi - lo)} height={vh} fill={ink} /> : <rect x={0} y={0} width={vw} height={vh} fill={ink} />}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={windowOn} onChange={(e) => setWindowOn(e.target.checked)} />
              on (off lets everything through)
            </label>
            <Slider label="width (em)" value={winWidth} min={0.5} max={12} step={0.1} onChange={setWinWidth} />
            <Slider label="entry" value={entry} min={0} max={2} step={0.01} onChange={setEntry} />
            <Slider label="trail" value={trail} min={0} max={2} step={0.01} onChange={setTrail} />
            <p className="text-xs text-muted-foreground">The timeline sweeps the window across each row. In Final, entry and trail are how far ahead of its leading edge and behind its trailing edge the window's lines keep going, thinning to nothing.</p>
          </Card>
          <Card title="Text" kind="input" preview={<Shot m={m} paper={paper}>{plain}</Shot>}>
            <textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            <Slider label="size" value={size} min={24} max={200} step={1} onChange={setSize} />
            <Slider label="font weight" value={weight} min={100} max={900} step={100} onChange={setWeight} />
          </Card>
        </Column>

        <Column top>
          <Card
            title="Windowed Lines"
            kind="combine"
            from={['Lines', 'Window']}
            preview={
              <Shot m={m} paper={paper}>
                {defs}
                {maskedBand}
              </Shot>
            }
          >
            <p className="text-xs text-muted-foreground">The lines, kept only where the window is open. Not a mask yet.</p>
          </Card>
          <Card
            title="Halftone Lines"
            kind="combine"
            from={['Lines', 'Text']}
            preview={
              <Shot m={m} paper={paper}>
                <path d={halftone} fill={ink} />
              </Shot>
            }
          >
            <Slider label="spread (em)" value={spread} min={0} max={0.6} step={0.01} onChange={setSpread} />
            <Slider label="gain" value={gain} min={0.5} max={4} step={0.1} onChange={setGain} />
            <p className="text-xs text-muted-foreground">The lines carry the tone. Each swells where the text is and thins away from it.</p>
          </Card>
        </Column>

        <Column top>
          <Card
            title="Masked Text"
            kind="combine"
            from={['Windowed Lines', 'Text']}
            preview={
              <Shot m={m} paper={paper}>
                {defs}
                {composite}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">shown</span>
              <select value={blend} onChange={(e) => setBlend(e.target.value as 'over' | 'through' | 'outside')} className="rounded border px-1 py-0.5">
                <option value="through">only in the lines</option>
                <option value="outside">only between the lines</option>
                <option value="over">no mask: stacked</option>
              </select>
            </label>
          </Card>
        </Column>

        <Column>
          <Card
            title="Final: reveal"
            kind="output"
            from={['Lines', 'Halftone Lines', 'Text', 'Window']}
            preview={
              <Shot m={m} paper={paper}>
                {m && frame ? <MorphArt m={m} frame={frame} text={text} textStyle={textStyle} ink={ink} /> : null}
              </Shot>
            }
          >
            <Slider label="ramp shift" value={shift} min={-1} max={1} step={0.01} onChange={setShift} />
            <Slider label="ramp length" value={ramp} min={0.1} max={3} step={0.01} onChange={setRamp} />
            <Slider label="pieces / letter" value={pieces} min={1} max={24} step={1} onChange={setPieces} />
            <Slider label="row stagger" value={stagger} min={0} max={1} step={0.05} onChange={setStagger} />
            <p className="text-xs text-muted-foreground">The morph is a band laid across the window, by position: flat lines at the window's leading edge, halftone in the middle, the original text by the time the band ends. Ramp length is the band's length in window widths. Ramp shift slides the band against the window and never moves the window: right makes the morph run ahead of the lines, left makes it trail behind. Shift eases to zero at the very start and end so those stay clean. Pieces cuts each letter into slices that turn one at a time. Row stagger starts each row of a wrapped text later than the one above: 0 writes every row at once, 1 one after another. This is the code the owl writes with.</p>
          </Card>
        </Column>
      </div>
      </div>
    </main>
  )
}
