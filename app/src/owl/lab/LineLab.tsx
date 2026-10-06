import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { linesFromGrid, rasterizeText, UNIT_PX, type Grid } from '@/hub/textLines'

/**
 * The line compositing builder (2026-10-06), shown as a node graph. It is not a real node engine:
 * the graph is fixed and each card is one stage whose output you can see on its own.
 *
 *   Lines ──┬→ Windowed Lines ─┬→ Masked Text ─────┐
 *   Window ─┘        ▲           │                    │
 *   Text ────────────┼───────────┘                    ├→ Final
 *     │              │                                │
 *     └──────────────┴→ Halftone Lines ───────────────┤   (wires are drawn on the page)
 *   Text (raw) ──────────────────────────────────────┘
 *
 * Masked Text and Halftone Lines never feed each other: both go straight to Final, which turns
 * each letter Masked Text → Halftone Lines → Raw Text, with the Windowed Lines still showing.
 *
 * The goal is a line halftone: the text is drawn by lines whose thickness follows the letters, and
 * each letter goes Masked Text → Halftone Lines → Raw Text as the Window's trailing (left) edge passes it.
 * One master timeline `t` (0 → 1) sweeps the Window across the word; scrub it or let it play and loop.
 */

type Letter = { l: number; r: number } | null
type Drawn = { grid: Grid; spacing: number; band: string; w: number; h: number; letters: Letter[] }

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
function Shot({ drawn, paper, children }: { drawn: Drawn | null; paper: string; children: ReactNode }) {
  if (!drawn) return <div className="h-16" />
  const vw = drawn.w / UNIT_PX
  const vh = drawn.h / UNIT_PX
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="block w-full rounded border" style={{ background: paper }} aria-hidden="true">
      {children}
    </svg>
  )
}

/** A box blur, separable, so a letter's tone spreads into the lines around it. */
function blur(data: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return data
  const pass = (src: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(src.length)
    const n = horizontal ? w : h
    const lines = horizontal ? h : w
    for (let k = 0; k < lines; k++) {
      let sum = 0
      const at = (i: number) => (horizontal ? k * w + i : i * w + k)
      for (let i = -r; i <= r; i++) sum += src[at(Math.min(n - 1, Math.max(0, i)))]
      for (let i = 0; i < n; i++) {
        out[at(i)] = sum / (2 * r + 1)
        sum += src[at(Math.min(n - 1, i + r + 1))] - src[at(Math.max(0, i - r))]
      }
    }
    return out
  }
  return pass(pass(data, true), false)
}

/**
 * The lab's variables as they sit in source. One declaration per line, `{ id, value }`, because that is
 * the shape the dev server's write-to-source endpoint patches in place (`app/vite-plugin-tune.ts`).
 * "Write to source" in the toolbar rewrites the `value:` of every knob you have moved.
 */
const KNOBS = {
  text: { id: 'line-lab.text', value: 'I am RAGtime' },
  size: { id: 'line-lab.size', value: 66 },
  weight: { id: 'line-lab.weight', value: 500 },
  pitch: { id: 'line-lab.pitch', value: 8 },
  ink: { id: 'line-lab.ink', value: '#1b2a49' },
  paper: { id: 'line-lab.paper', value: '#fffdf2' },
  cover: { id: 'line-lab.cover', value: 0.2 },
  windowOn: { id: 'line-lab.windowOn', value: true },
  winWidth: { id: 'line-lab.winWidth', value: 1 },
  t: { id: 'line-lab.t', value: 1 },
  loop: { id: 'line-lab.loop', value: true },
  duration: { id: 'line-lab.duration', value: 1 },
  blend: { id: 'line-lab.blend', value: 'through' },
  spread: { id: 'line-lab.spread', value: 6 },
  gain: { id: 'line-lab.gain', value: 0.9 },
  ramp: { id: 'line-lab.ramp', value: 1 },
  trail: { id: 'line-lab.trail', value: 0.6 },
  entry: { id: 'line-lab.entry', value: 0.6 },
  shift: { id: 'line-lab.shift', value: 0 },
  pieces: { id: 'line-lab.pieces', value: 2 },
  mode: { id: 'line-lab.mode', value: 'one' },
  linesBack: { id: 'line-lab.linesBack', value: 1 },
  backInk: { id: 'line-lab.backInk', value: '#1b2949' },
}
type KnobKey = keyof typeof KNOBS

export default function LineLab() {
  const [text, setText] = useState(KNOBS.text.value)
  const [size, setSize] = useState(KNOBS.size.value)
  const [weight, setWeight] = useState(KNOBS.weight.value)
  const [pitch, setPitch] = useState(KNOBS.pitch.value)
  const [ink, setInk] = useState(KNOBS.ink.value)
  const [paper, setPaper] = useState(KNOBS.paper.value)
  const [cover, setCover] = useState(KNOBS.cover.value)
  const [windowOn, setWindowOn] = useState(KNOBS.windowOn.value)
  const [winWidth, setWinWidth] = useState(KNOBS.winWidth.value)
  const [t, setT] = useState(KNOBS.t.value)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(KNOBS.loop.value)
  const [duration, setDuration] = useState(KNOBS.duration.value)
  const [blend, setBlend] = useState(KNOBS.blend.value as 'over' | 'through' | 'outside')
  const [spread, setSpread] = useState(KNOBS.spread.value)
  const [gain, setGain] = useState(KNOBS.gain.value)
  const [ramp, setRamp] = useState(KNOBS.ramp.value)
  const [trail, setTrail] = useState(KNOBS.trail.value)
  const [entry, setEntry] = useState(KNOBS.entry.value)
  const [shift, setShift] = useState(KNOBS.shift.value)
  const [pieces, setPieces] = useState(KNOBS.pieces.value)
  const [mode, setMode] = useState(KNOBS.mode.value as 'one' | 'layered')
  const [linesBack, setLinesBack] = useState(KNOBS.linesBack.value)
  const [backInk, setBackInk] = useState(KNOBS.backInk.value)
  const [note, setNote] = useState('')

  const values: Record<KnobKey, string | number | boolean> = { text, size, weight, pitch, ink, paper, cover, windowOn, winWidth, t, loop, duration, blend, spread, gain, ramp, trail, entry, shift, pieces, mode, linesBack, backInk }
  const moved = (Object.keys(KNOBS) as KnobKey[]).filter((k) => values[k] !== KNOBS[k].value)
  const resetAll = () => {
    setText(KNOBS.text.value); setSize(KNOBS.size.value); setWeight(KNOBS.weight.value); setPitch(KNOBS.pitch.value)
    setInk(KNOBS.ink.value); setPaper(KNOBS.paper.value); setCover(KNOBS.cover.value); setWindowOn(KNOBS.windowOn.value)
    setWinWidth(KNOBS.winWidth.value); setT(KNOBS.t.value); setLoop(KNOBS.loop.value); setDuration(KNOBS.duration.value)
    setBlend(KNOBS.blend.value as 'over' | 'through' | 'outside'); setSpread(KNOBS.spread.value); setGain(KNOBS.gain.value)
    setRamp(KNOBS.ramp.value); setTrail(KNOBS.trail.value); setEntry(KNOBS.entry.value); setShift(KNOBS.shift.value); setPieces(KNOBS.pieces.value); setMode(KNOBS.mode.value as 'one' | 'layered'); setLinesBack(KNOBS.linesBack.value); setBackInk(KNOBS.backInk.value)
    setNote('reset to what is in source')
  }
  const writeToSource = async () => {
    if (!moved.length) return setNote('nothing moved')
    try {
      const response = await fetch('/__tune/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ edits: moved.map((k) => ({ kind: 'value', id: KNOBS[k].id, file: 'src/owl/lab/LineLab.tsx', value: values[k] })) }),
      })
      if (!response.ok) return setNote(`write failed: ${await response.text()}`)
      const { results } = (await response.json()) as { results: { id: string; ok: boolean; detail: string }[] }
      const bad = results.filter((r) => !r.ok)
      setNote(bad.length ? `wrote ${results.length - bad.length}, failed: ${bad.map((r) => r.id).join(', ')}` : `wrote ${results.length} to src/owl/lab/LineLab.tsx`)
    } catch (error) {
      setNote(`write failed: ${error instanceof Error ? error.message : 'no dev server'}`)
    }
  }
  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(Object.fromEntries((Object.keys(KNOBS) as KnobKey[]).map((k) => [k, values[k]])), null, 2))
    setNote('all values copied as JSON')
  }

  const graph = useRef<HTMLDivElement>(null)
  const [wires, setWires] = useState<{ d: string; key: string }[]>([])
  const [wireBox, setWireBox] = useState({ w: 0, h: 0 })

  const uid = useId().replace(/:/g, '')
  const host = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState<Drawn | null>(null)

  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    let raf = 0
    const draw = () => {
      const grid = rasterizeText(el)
      if (!grid) return
      const spacing = Math.max(1.5, (pitch * size) / 52)
      const flat = { ...grid, data: new Float32Array(grid.data.length).fill(cover) }
      // Where each letter sits across the box, in px, so the reveal can treat letters one by one.
      const node = [...el.childNodes].find((n) => n.nodeType === 3)
      const box = el.getBoundingClientRect()
      const range = document.createRange()
      const letters: Letter[] = [...(node?.textContent ?? '')].map((ch, i) => {
        if (!node || /\s/.test(ch)) return null
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const r = range.getClientRects()[0]
        return r ? { l: r.left - box.left, r: r.right - box.left } : null
      })
      setDrawn({ grid, spacing, band: linesFromGrid(flat, spacing), w: grid.w, h: grid.h, letters })
    }
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    draw()
    void document.fonts?.ready.then(later)
    return () => cancelAnimationFrame(raf)
  }, [text, size, weight, pitch, cover])

  // The word broken into pieces: each letter is cut into `pieces` equal slices, and every slice turns on its
  // own, so the change can run through a letter and not only from letter to letter.
  const slices = useMemo(() => {
    const out: { l: number; r: number; lw: number }[] = []
    for (const lt of drawn?.letters ?? []) {
      if (!lt) continue
      const step = (lt.r - lt.l) / pieces
      for (let k = 0; k < pieces; k++) out.push({ l: lt.l + k * step, r: lt.l + (k + 1) * step, lw: lt.r - lt.l })
    }
    return out
  }, [drawn, pieces])
  // The master timeline. The window is fixed for a given t: it enters just off the left of the word at t = 0 and
  // its leading edge has carried the whole morph band past the last slice at t = 1.
  const winPx = drawn ? winWidth * drawn.w : 0
  const bandPx = Math.max(1, ramp * winPx)
  const wordEnd = slices.reduce((m, sl) => Math.max(m, sl.r), 0)
  // The entry taper reaches `entry` window-widths ahead of the leading edge, so start that far further left.
  const startLo = -winWidth * (1 + entry)
  // At t = 1 the whole band is past the last slice and the window's lines, trail included, have cleared the word.
  const finishLo = drawn ? Math.max((wordEnd + bandPx) / drawn.w - winWidth, wordEnd / drawn.w + trail * winWidth) : 1
  const lo = startLo + t * (finishLo - startLo)
  const hi = lo + winWidth
  // `shift` is eased to zero over the first and last 15% of the timeline, so t = 0 is always empty and t = 1 is
  // always the finished text, for any shift. In between it applies in full.
  const shiftNow = shift * Math.min(1, t / 0.15, (1 - t) / 0.15)
  const vw = drawn ? drawn.w / UNIT_PX : 0
  const vh = drawn ? drawn.h / UNIT_PX : 0
  const win = `${uid}-win`
  const inWords = `${uid}-in`
  const outWords = `${uid}-out`
  const fade = `${uid}-fade`
  const show = `${uid}-show`
  const rawMask = `${uid}-raw`
  const endMask = `${uid}-end`
  const lineFade = `${uid}-linefade`

  // The morph is a band laid across the window, by position. At the band's start edge a column is still flat
  // lines (0); `ramp` window-widths behind it the column is the finished text (1). The start edge is the
  // window's leading edge, moved by `shift` (in window widths). The window itself never moves with the band.
  const bandAt = (x: number) => (drawn ? Math.min(1, Math.max(0, (hi * drawn.w + shiftNow * winPx - x) / bandPx)) : 0)
  const progress = slices.map((sl) => bandAt((sl.l + sl.r) / 2))
  // Three phases per column, so Halftone Lines is a stage you see and not a blink: flat lines turn into halftone
  // over the first part of the band, the halftone holds, then it turns into the original text.
  const toHalftone = progress.map((p) => Math.min(1, p / 0.35))
  const toRaw = progress.map((p) => Math.min(1, Math.max(0, (p - 0.65) / 0.35)))
  const progressKey = toRaw.map((p) => p.toFixed(2)).join(',')

  // Halftone Lines: the lines carry the tone. The text is softened so the lines swell toward the
  // middle of a letter and thin out away from it. `morphed` thickens each letter's lines to the
  // solid letter by that letter's progress, so the lines themselves become the raw text.
  const toned = useMemo(() => (drawn ? blur(drawn.grid.data, drawn.w, drawn.h, spread).map((v) => Math.min(1, v * gain)) : new Float32Array(0)), [drawn, spread, gain])
  const halftone = useMemo(() => {
    if (!drawn) return { still: '', morphed: '' }
    const { grid, spacing, w, h } = drawn
    const still = linesFromGrid({ w, h, data: toned }, spacing)
    const col = new Float32Array(w)
    slices.forEach((sl, i) => {
      for (let x = Math.max(0, Math.floor(sl.l)); x < Math.min(w, Math.ceil(sl.r)); x++) col[x] = toRaw[i] ?? 0
    })
    const out = new Float32Array(toned.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const solid = grid.data[i] > 0.2 ? 1 : 0
        out[i] = toned[i] + (solid - toned[i]) * col[x]
      }
    }
    return { still, morphed: linesFromGrid({ w, h, data: out }, spacing) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, toned, progressKey])

  // The morph layer. It is the line engine's output from a field that grows from nothing: the halftone tone
  // (lines swell where the letters are), then the solid letters, each column along the band by its own progress.
  // The window's flat lines sit under it as a fixed underlay, so the morph can run ahead of or behind the lines
  // without the window changing. Columns the window has not reached yet stay empty.
  const hiPx = drawn ? Math.round(hi * drawn.w) : 0
  const allKey = progress.map((p) => p.toFixed(3)).join(',')
  const oneSet = useMemo(() => {
    if (!drawn || mode !== 'one') return ''
    const { grid, spacing, w, h } = drawn
    // One progress value per column: the band's value at that column, held constant across a slice so the
    // `pieces` cut still steps through each letter.
    const colP = new Float32Array(w)
    for (let x = 0; x < w; x++) colP[x] = bandAt(x)
    slices.forEach((sl, i) => {
      for (let x = Math.max(0, Math.floor(sl.l)); x < Math.min(w, Math.ceil(sl.r)); x++) colP[x] = progress[i] ?? 0
    })
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (windowOn && x >= hiPx) continue
        const i = y * w + x
        const a = Math.min(1, colP[x] / 0.35)
        const r = Math.min(1, Math.max(0, (colP[x] - 0.65) / 0.35))
        const solid = grid.data[i] > 0.2 ? 1 : 0
        // The flat lines are the window's own underlay (drawn separately), so the morph starts from nothing and
        // only adds: the halftone swelling on the lines, then the solid letters.
        const f = toned[i] * a
        out[i] = f + (solid - f) * r
      }
    }
    return linesFromGrid({ w, h, data: out }, spacing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, toned, mode, cover, windowOn, hiPx, allKey])

  // The window's lines, as a fixed underlay. Full weight inside the window; behind its trailing edge they do not
  // stop dead, they thin out over `trail` window-widths, so the lines taper as they leave, and ahead of its leading
  // edge they thin in over `entry` window-widths, the same taper mirrored. This is separate from the morph, so ramp shift cannot touch it.
  const loPx = drawn ? Math.round(lo * drawn.w) : 0
  const underlay = useMemo(() => {
    if (!drawn || mode !== 'one') return ''
    const { spacing, w, h } = drawn
    const tailPx = Math.max(1, trail * winPx)
    const headPx = Math.max(1, entry * winPx)
    const col = new Float32Array(w)
    for (let x = 0; x < w; x++) {
      if (!windowOn) col[x] = cover
      else if (x >= hiPx) col[x] = cover * Math.max(0, 1 - (x - hiPx) / headPx)
      else if (x >= loPx) col[x] = cover
      else col[x] = cover * Math.max(0, 1 - (loPx - x) / tailPx)
    }
    const data = new Float32Array(w * h)
    for (let y = 0; y < h; y++) data.set(col, y * w)
    return linesFromGrid({ w, h, data }, spacing)
  }, [drawn, mode, cover, windowOn, hiPx, loPx, trail, entry, winPx])

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
        const next = tRef.current + dt / (duration * 1000)
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
  }, [playing, loop, duration])

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
      ['Windowed Lines', 'Final: reveal'],
      ['Masked Text', 'Final: reveal'],
      ['Halftone Lines', 'Final: reveal'],
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
  }, [drawn])

  const defs = (
    <defs>
      <clipPath id={win}>
        <rect x={vw * lo} y={0} width={vw * (hi - lo)} height={vh} />
      </clipPath>
      {drawn ? (
        <>
          <mask id={inWords} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <path d={drawn.band} fill="#fff" clipPath={windowOn ? `url(#${win})` : undefined} />
          </mask>
          <mask id={outWords} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <rect x={0} y={0} width={vw} height={vh} fill="#fff" />
            <path d={drawn.band} fill="#000" clipPath={windowOn ? `url(#${win})` : undefined} />
          </mask>
          {/* Each slice mask is one rectangle painted with a gradient that steps between pieces. Separate
              rectangles side by side leave a hairline gap where their opacities differ; one paint does not. */}
          {slices.length ? (
            <>
              {(
                [
                  [fade, toHalftone.map((v) => 1 - v)],
                  [show, toHalftone.map((v, i) => v * (1 - (toRaw[i] ?? 0) ** 2))],
                  [endMask, toRaw],
                  [lineFade, toRaw.map((v) => 1 - Math.min(1, Math.max(0, (v - 0.4) / 0.6)))],
                  [rawMask, toRaw.map((v) => v ** 2)],
                ] as [string, number[]][]
              ).map(([id, vals]) => (
                <g key={id}>
                  <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={vw} y2={0}>
                    {slices.flatMap((sl, i) => [
                      <stop key={`${i}a`} offset={sl.l / drawn.w} stopColor="#fff" stopOpacity={vals[i] ?? 0} />,
                      <stop key={`${i}b`} offset={sl.r / drawn.w} stopColor="#fff" stopOpacity={vals[i] ?? 0} />,
                    ])}
                  </linearGradient>
                  <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
                    <rect x={0} y={0} width={vw} height={vh} fill={`url(#${id}-g)`} />
                  </mask>
                </g>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </defs>
  )
  // What Windowed Lines passes on: the band inside the window, or the whole band when the window is bypassed.
  const maskedBand = drawn ? <path d={drawn.band} fill={ink} clipPath={windowOn ? `url(#${win})` : undefined} /> : null

  // The raw words, no effect, laid out exactly as the engine measured them.
  const plainText = () =>
    drawn ? (
      <foreignObject x={0} y={0} width={drawn.w} height={drawn.h} transform={`scale(${1 / UNIT_PX})`} style={{ overflow: 'visible' }}>
        <div className="whitespace-nowrap leading-tight" style={{ fontFamily: 'Lato, sans-serif', fontSize: size, fontWeight: weight, color: ink }}>
          {text}
        </div>
      </foreignObject>
    ) : null
  const plain = plainText()

  // Masked Text: the Windowed Lines are the mask and the text is what shows through them.
  const composite = drawn ? (
    blend === 'over' ? (
      <>
        {plain}
        {maskedBand}
      </>
    ) : (
      <g mask={`url(#${blend === 'through' ? inWords : outWords})`}>{plain}</g>
    )
  ) : null

  // Final. 'one': a single set of lines grows into the word. 'layered': Masked Text → Halftone Lines → Raw Text
  // as three stacked versions, each fading into the next.
  const finalArt = drawn ? (
    mode === 'one' ? (
      <>
        <path d={underlay} fill={ink} />
        <g mask={`url(#${lineFade})`}>
          <path d={oneSet} fill={ink} />
        </g>
        <g mask={`url(#${endMask})`}>{plain}</g>
      </>
    ) : (
      <>
        {linesBack > 0 ? <path d={drawn.band} fill={backInk} opacity={linesBack} clipPath={windowOn ? `url(#${win})` : undefined} /> : null}
        <g mask={`url(#${fade})`}>{composite}</g>
        <g mask={`url(#${show})`}>
          <path d={halftone.morphed} fill={ink} />
        </g>
        <g mask={`url(#${rawMask})`}>{plain}</g>
      </>
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
        <span className="w-28 text-xs tabular-nums text-muted-foreground">{(t * duration).toFixed(1)}s / {duration}s</span>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          loop
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">length</span>
          <input type="range" min={0.2} max={3} step={0.1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-28" />
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
        className="pointer-events-none absolute -left-[9999px] top-0 inline-block whitespace-nowrap leading-tight"
        style={{ fontFamily: 'Lato, sans-serif', fontSize: size, fontWeight: weight, color: ink }}
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
              <Shot drawn={drawn} paper={paper}>
                {drawn ? <path d={drawn.band} fill={ink} /> : null}
              </Shot>
            }
          >
            <Slider label="line pitch" value={pitch} min={1.5} max={8} step={0.1} onChange={setPitch} />
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
              <Shot drawn={drawn} paper={paper}>
                <rect x={0} y={0} width={vw} height={vh} fill="#000" opacity={0.08} />
                {windowOn ? <rect x={vw * lo} y={0} width={vw * (hi - lo)} height={vh} fill={ink} /> : <rect x={0} y={0} width={vw} height={vh} fill={ink} />}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={windowOn} onChange={(e) => setWindowOn(e.target.checked)} />
              on (off lets everything through)
            </label>
            <Slider label="width" value={winWidth} min={0.1} max={1} step={0.01} onChange={setWinWidth} />
            <Slider label="entry" value={entry} min={0} max={2} step={0.01} onChange={setEntry} />
            <Slider label="trail" value={trail} min={0} max={2} step={0.01} onChange={setTrail} />
            <p className="text-xs text-muted-foreground">The timeline sweeps the window across the word. In Final, the morph is a band laid across the window (see ramp shift and ramp length). In Final, entry and trail are how far ahead of its leading edge and behind its trailing edge the window's lines keep going, thinning to nothing.</p>
          </Card>
          <Card title="Text" kind="input" preview={<Shot drawn={drawn} paper={paper}>{plain}</Shot>}>
            <input value={text} onChange={(e) => setText(e.target.value)} className="rounded border px-2 py-1 text-sm" />
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
              <Shot drawn={drawn} paper={paper}>
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
              <Shot drawn={drawn} paper={paper}>
                <path d={halftone.still} fill={ink} />
              </Shot>
            }
          >
            <Slider label="spread" value={spread} min={0} max={30} step={1} onChange={setSpread} />
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
              <Shot drawn={drawn} paper={paper}>
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
            from={mode === 'one' ? ['Lines', 'Text', 'Window'] : ['Windowed Lines', 'Masked Text', 'Halftone Lines', 'Text', 'Window']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {finalArt}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">built as</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as 'one' | 'layered')} className="rounded border px-1 py-0.5">
                <option value="one">one set of lines</option>
                <option value="layered">layered (3 versions)</option>
              </select>
            </label>
            {mode === 'one' ? null : (
              <>
                <Slider label="lines shown" value={linesBack} min={0} max={1} step={0.05} onChange={setLinesBack} />
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">line colour</span>
              <input type="color" value={backInk} onChange={(e) => setBackInk(e.target.value)} />
            </label>
              </>
            )}
            <Slider label="ramp shift" value={shift} min={-1} max={1} step={0.01} onChange={setShift} />
            <Slider label="pieces / letter" value={pieces} min={1} max={24} step={1} onChange={setPieces} />
            <Slider label="ramp length" value={ramp} min={0.1} max={3} step={0.01} onChange={setRamp} />
            <p className="text-xs text-muted-foreground">The morph is a band laid across the window, by position: flat lines at the window's leading edge, halftone in the middle, the original text by the time the band ends. Ramp length is the band's length in window widths. Ramp shift slides the band against the window, in window widths, and never moves the window: right makes the morph run ahead of the lines, left makes it trail behind. Shift eases to zero at the very start and end of the timeline so those stay clean. Pieces cuts each letter into slices that turn one at a time.</p>
          </Card>
        </Column>
      </div>
      </div>
    </main>
  )
}
