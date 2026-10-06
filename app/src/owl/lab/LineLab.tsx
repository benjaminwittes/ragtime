import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { linesFromGrid, rasterizeText, UNIT_PX } from '@/hub/textLines'

/**
 * The line compositing builder (2026-10-06), shown as a node graph. It is not a real node engine:
 * the graph is fixed and each card is one stage whose output you can see on its own. Read left to
 * right, the effect builds from piece to piece.
 *
 *   [Lines]  even lines over the whole box, blind to the words   ─┐
 *   [Window] a left and a right edge, a mask                     ─┴→ [Mask] lines ∩ window ─┐
 *   [Text]   the words, drawn as lines by the hub engine         ───────────────────────────┴→ [Composite] → [Output]
 *
 * Nothing animates. A new node is added only when the ones before it read right to Thomas.
 */

type Drawn = { words: string; band: string; w: number; h: number }

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
function Node({ title, kind, from, preview, children }: { title: string; kind: 'input' | 'mask' | 'combine' | 'output'; from?: string[]; preview: ReactNode; children?: ReactNode }) {
  const tint = { input: 'bg-emerald-600', mask: 'bg-amber-600', combine: 'bg-sky-600', output: 'bg-violet-700' }[kind]
  return (
    <div className="flex w-[19rem] shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm" data-node={title}>
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

export default function LineLab() {
  const [text, setText] = useState('I am RAGtime')
  const [size, setSize] = useState(96)
  const [weight, setWeight] = useState(800)
  const [pitch, setPitch] = useState(3.6)
  const [ink, setInk] = useState('#1b2a49')
  const [paper, setPaper] = useState('#fffdf2')
  const [cover, setCover] = useState(0.55)
  const [windowOn, setWindowOn] = useState(true)
  const [left, setLeft] = useState(0.2)
  const [right, setRight] = useState(0.5)
  const [blend, setBlend] = useState<'over' | 'through' | 'outside'>('through')

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
      setDrawn({ words: linesFromGrid(grid, spacing), band: linesFromGrid(flat, spacing), w: grid.w, h: grid.h })
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

  const defs = (
    <defs>
      <clipPath id={win}>
        <rect x={vw * lo} y={0} width={vw * (hi - lo)} height={vh} />
      </clipPath>
      {drawn ? (
        <>
          <mask id={inWords} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <path d={drawn.words} fill="#fff" />
          </mask>
          <mask id={outWords} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <rect x={0} y={0} width={vw} height={vh} fill="#fff" />
            <path d={drawn.words} fill="#000" />
          </mask>
        </>
      ) : null}
    </defs>
  )
  // What the Mask node passes on: the band inside the window, or the whole band when the window is bypassed.
  const maskedBand = drawn ? <path d={drawn.band} fill={ink} clipPath={windowOn ? `url(#${win})` : undefined} /> : null
  // Composite: the words are the mask. 'through' keeps the masked band only where the words are,
  // 'outside' keeps it only where they are not (the words stay as they are), 'over' just stacks them.
  const composite = drawn ? (
    blend === 'over' ? (
      <>
        <path d={drawn.words} fill={ink} />
        {maskedBand}
      </>
    ) : blend === 'through' ? (
      <g mask={`url(#${inWords})`}>{maskedBand}</g>
    ) : (
      <>
        <path d={drawn.words} fill={ink} />
        <g mask={`url(#${outWords})`}>{maskedBand}</g>
      </>
    )
  ) : null

  return (
    <main className="mx-auto max-w-[96rem] px-6 py-8" data-line-lab>
      <h1 className="text-lg font-semibold">Line compositing builder</h1>
      <p className="mb-6 text-sm text-muted-foreground">Read left to right. Each card shows what that stage outputs. No motion yet.</p>

      {/* The words are measured here, off screen. The Text node shows what the engine drew from them. */}
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
          <Node
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
          </Node>
          <Node
            title="Text"
            kind="input"
            preview={
              <Shot drawn={drawn} paper={paper}>
                {drawn ? <path d={drawn.words} fill={ink} /> : null}
              </Shot>
            }
          >
            <input value={text} onChange={(e) => setText(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            <Slider label="size" value={size} min={24} max={200} step={1} onChange={setSize} />
            <Slider label="font weight" value={weight} min={100} max={900} step={100} onChange={setWeight} />
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
            title="Window"
            kind="mask"
            preview={
              <Shot drawn={drawn} paper={paper}>
                <rect x={0} y={0} width={vw} height={vh} fill="#000" opacity={0.08} />
                {windowOn ? <rect x={vw * lo} y={0} width={vw * (hi - lo)} height={vh} fill={ink} /> : <rect x={0} y={0} width={vw} height={vh} fill={ink} />}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={windowOn} onChange={(e) => setWindowOn(e.target.checked)} />
              on (off passes everything)
            </label>
            <Slider label="left edge" value={left} min={0} max={1} step={0.005} onChange={setLeft} />
            <Slider label="right edge" value={right} min={0} max={1} step={0.005} onChange={setRight} />
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
            title="Mask"
            kind="combine"
            from={['Lines', 'Window']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {maskedBand}
              </Shot>
            }
          >
            <p className="text-xs text-muted-foreground">Keeps the lines only where the window is open.</p>
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
            title="Composite"
            kind="combine"
            from={['Text', 'Mask']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {composite}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">words are</span>
              <select value={blend} onChange={(e) => setBlend(e.target.value as 'over' | 'through' | 'outside')} className="rounded border px-1 py-0.5">
                <option value="through">a mask: lines only in the words</option>
                <option value="outside">a knockout: lines only outside the words</option>
                <option value="over">no mask: stacked</option>
              </select>
            </label>
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
            title="Output"
            kind="output"
            from={['Composite']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {composite}
              </Shot>
            }
          />
        </Column>
      </div>
    </main>
  )
}
