import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { linesFromGrid, rasterizeText, UNIT_PX, type Grid } from '@/hub/textLines'

/**
 * The line compositing builder (2026-10-06), shown as a node graph. It is not a real node engine:
 * the graph is fixed and each card is one stage whose output you can see on its own.
 *
 *   Lines ──┐
 *           ├→ Windowed Lines ─┐
 *   Window ─┤                  ├→ Masked Text ─→ Masked Text + Lines ──┐
 *   Text ───┼──────────────────┘                                        ├→ Final
 *           └→ Halftone Lines (the lines carry the tone) ───────────────┘
 *
 * The goal is a line halftone: the text is drawn by lines whose thickness follows the letters, and
 * each letter thickens into the raw text as the Window's right edge reaches it. Nothing animates;
 * you drag the Window to play it.
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

function Arrow() {
  return <div className="flex shrink-0 items-center self-center px-1 text-xl text-muted-foreground">→</div>
}

function Column({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-col justify-center gap-4">{children}</div>
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

export default function LineLab() {
  const [text, setText] = useState('I am RAGtime')
  const [size, setSize] = useState(96)
  const [weight, setWeight] = useState(800)
  const [pitch, setPitch] = useState(5.5)
  const [ink, setInk] = useState('#1b2a49')
  const [paper, setPaper] = useState('#fffdf2')
  const [cover, setCover] = useState(0.55)
  const [windowOn, setWindowOn] = useState(true)
  const [left, setLeft] = useState(0.2)
  const [right, setRight] = useState(0.5)
  const [blend, setBlend] = useState<'over' | 'through' | 'outside'>('through')
  const [linesBack, setLinesBack] = useState(0.35)
  const [backInk, setBackInk] = useState('#c2410c')
  const [spread, setSpread] = useState(12)
  const [gain, setGain] = useState(1.0)
  const [source, setSource] = useState<'halftone' | 'masked'>('halftone')
  const [soft, setSoft] = useState(1.5)

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

  const lo = Math.min(left, right)
  const hi = Math.max(left, right)
  const vw = drawn ? drawn.w / UNIT_PX : 0
  const vh = drawn ? drawn.h / UNIT_PX : 0
  const win = `${uid}-win`
  const inWords = `${uid}-in`
  const outWords = `${uid}-out`
  const fade = `${uid}-fade`

  // Progress of each letter from halftone (0) to raw text (1). The front is the Window's right edge.
  // A letter starts to turn as the front touches its left edge and has turned once the front is
  // `soft` letter-widths past it.
  const progress = (drawn?.letters ?? []).map((lt) => {
    if (!lt || !drawn) return 0
    return Math.min(1, Math.max(0, (hi * drawn.w - lt.l) / Math.max(1e-6, (lt.r - lt.l) * soft)))
  })
  const progressKey = progress.map((p) => p.toFixed(2)).join(',')

  // Halftone Lines: the lines carry the tone. The text is softened so the lines swell toward the
  // middle of a letter and thin out away from it. `morphed` thickens each letter's lines to the
  // solid letter by that letter's progress, so the lines themselves become the raw text.
  const halftone = useMemo(() => {
    if (!drawn) return { still: '', morphed: '' }
    const { grid, spacing, letters, w, h } = drawn
    const toned = blur(grid.data, w, h, spread).map((v) => Math.min(1, v * gain))
    const still = linesFromGrid({ w, h, data: toned }, spacing)
    const col = new Float32Array(w)
    letters.forEach((lt, i) => {
      if (!lt) return
      for (let x = Math.max(0, Math.floor(lt.l)); x < Math.min(w, Math.ceil(lt.r)); x++) col[x] = progress[i] ?? 0
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
  }, [drawn, spread, gain, progressKey])

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
          <mask id={fade} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <rect x={0} y={0} width={vw} height={vh} fill="#fff" />
            {drawn.letters.map((lt, i) =>
              lt ? <rect key={i} x={lt.l / UNIT_PX} y={0} width={(lt.r - lt.l) / UNIT_PX} height={vh} fill="#000" opacity={progress[i] ?? 0} /> : null,
            )}
          </mask>
        </>
      ) : null}
    </defs>
  )
  // What Windowed Lines passes on: the band inside the window, or the whole band when the window is bypassed.
  const maskedBand = drawn ? <path d={drawn.band} fill={ink} clipPath={windowOn ? `url(#${win})` : undefined} /> : null

  // The raw words, no effect, laid out exactly as the engine measured them. `opacities` fades single letters.
  const plainText = (opacities?: number[]) =>
    drawn ? (
      <foreignObject x={0} y={0} width={drawn.w} height={drawn.h} transform={`scale(${1 / UNIT_PX})`} style={{ overflow: 'visible' }}>
        <div className="whitespace-nowrap leading-tight" style={{ fontFamily: 'Lato, sans-serif', fontSize: size, fontWeight: weight, color: ink }}>
          {opacities ? [...text].map((ch, i) => <span key={i} style={{ opacity: opacities[i] ?? 0 }}>{ch}</span>) : text}
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

  // Windowed Lines laid back under Masked Text, in their own colour.
  const linesAndMasked = drawn ? (
    <>
      {linesBack > 0 ? <path d={drawn.band} fill={backInk} opacity={linesBack} clipPath={windowOn ? `url(#${win})` : undefined} /> : null}
      {composite}
    </>
  ) : null

  // Final: every letter starts as halftone; each one turns into raw text as the front reaches it.
  const finalArt = drawn ? (
    source === 'halftone' ? (
      <>
        <path d={halftone.morphed} fill={ink} />
        {plainText(progress.map((p) => p * p))}
      </>
    ) : (
      <>
        <g mask={`url(#${fade})`}>{composite}</g>
        {plainText(progress)}
      </>
    )
  ) : null

  return (
    <main className="mx-auto max-w-[110rem] px-6 py-8" data-line-lab>
      <h1 className="text-lg font-semibold">Line compositing builder</h1>
      <p className="mb-6 text-sm text-muted-foreground">Read left to right. Each card shows what that stage outputs. Drag the Window to play the reveal.</p>

      {/* The words are measured here, off screen. The Text node shows the plain words. */}
      <div
        ref={host}
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] top-0 inline-block whitespace-nowrap leading-tight"
        style={{ fontFamily: 'Lato, sans-serif', fontSize: size, fontWeight: weight, color: ink }}
      >
        {text}
      </div>

      <div className="flex items-stretch overflow-x-auto pb-4">
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
            <Slider label="left edge" value={left} min={0} max={1} step={0.005} onChange={setLeft} />
            <Slider label="right edge" value={right} min={0} max={1} step={0.005} onChange={setRight} />
            <p className="text-xs text-muted-foreground">The right edge is also the reveal front in Final.</p>
          </Card>
          <Card title="Text" kind="input" preview={<Shot drawn={drawn} paper={paper}>{plain}</Shot>}>
            <input value={text} onChange={(e) => setText(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            <Slider label="size" value={size} min={24} max={200} step={1} onChange={setSize} />
            <Slider label="font weight" value={weight} min={100} max={900} step={100} onChange={setWeight} />
          </Card>
        </Column>

        <Arrow />

        <Column>
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

        <Arrow />

        <Column>
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

        <Arrow />

        <Column>
          <Card
            title="Masked Text + Lines"
            kind="combine"
            from={['Masked Text', 'Windowed Lines']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {linesAndMasked}
              </Shot>
            }
          >
            <Slider label="lines back" value={linesBack} min={0} max={1} step={0.05} onChange={setLinesBack} />
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">line colour</span>
              <input type="color" value={backInk} onChange={(e) => setBackInk(e.target.value)} />
            </label>
            <p className="text-xs text-muted-foreground">Windowed Lines laid back under Masked Text, in their own colour.</p>
          </Card>
        </Column>

        <Arrow />

        <Column>
          <Card
            title="Final: reveal"
            kind="output"
            from={[source === 'halftone' ? 'Halftone Lines' : 'Masked Text', 'Text', 'Window']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {finalArt}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">starts as</span>
              <select value={source} onChange={(e) => setSource(e.target.value as 'halftone' | 'masked')} className="rounded border px-1 py-0.5">
                <option value="halftone">Halftone Lines</option>
                <option value="masked">Masked Text</option>
              </select>
            </label>
            <Slider label="ramp (letters)" value={soft} min={0.05} max={4} step={0.05} onChange={setSoft} />
            <p className="text-xs text-muted-foreground">Every letter starts as halftone. It turns into raw text as the Window's right edge reaches it. Ramp is how many letter widths the turn takes.</p>
          </Card>
        </Column>
      </div>
    </main>
  )
}
