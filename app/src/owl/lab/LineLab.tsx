import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { linesFromGrid, rasterizeText, UNIT_PX } from '@/hub/textLines'

/**
 * The line compositing builder (2026-10-06), shown as a node graph. It is not a real node engine:
 * the graph is fixed and each card is one stage whose output you can see on its own.
 *
 *   Lines ──┐
 *           ├→ Windowed Lines ──┬──────────────────────────┐
 *   Window ─┘                   ├→ Masked Text ─→ Masked Text + Lines ─→ Final
 *   Text ──→ Text as Lines ─────┘                                          ↑
 *   Text (raw, again) ────────────────────────────────────────────────────┘
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
  const [textFrom, setTextFrom] = useState<'plain' | 'lines'>('plain')
  const [linesBack, setLinesBack] = useState(0.35)
  const [rawText, setRawText] = useState<'under' | 'over' | 'off'>('under')

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
            <path d={drawn.band} fill="#fff" clipPath={windowOn ? `url(#${win})` : undefined} />
          </mask>
          <mask id={outWords} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            <rect x={0} y={0} width={vw} height={vh} fill="#fff" />
            <path d={drawn.band} fill="#000" clipPath={windowOn ? `url(#${win})` : undefined} />
          </mask>
        </>
      ) : null}
    </defs>
  )
  // What the Mask node passes on: the band inside the window, or the whole band when the window is bypassed.
  const maskedBand = drawn ? <path d={drawn.band} fill={ink} clipPath={windowOn ? `url(#${win})` : undefined} /> : null
  // The raw words, no effect, laid out exactly as the engine measured them.
  const plain = drawn ? (
    <foreignObject x={0} y={0} width={drawn.w} height={drawn.h} transform={`scale(${1 / UNIT_PX})`} style={{ overflow: 'visible' }}>
      <div
        className="whitespace-nowrap leading-tight"
        style={{ fontFamily: 'Lato, sans-serif', fontSize: size, fontWeight: weight, color: ink }}
      >
        {text}
      </div>
    </foreignObject>
  ) : null
  const textArt = drawn ? (textFrom === 'plain' ? plain : <path d={drawn.words} fill={ink} />) : null

  // Masked Text: the Windowed Lines are the mask and the text is what shows through them.
  // 'through' keeps the text only inside the lines; 'outside' keeps it only between them; 'over' stacks.
  const composite = drawn ? (
    blend === 'over' ? (
      <>
        {textArt}
        {maskedBand}
      </>
    ) : (
      <g mask={`url(#${blend === 'through' ? inWords : outWords})`}>{textArt}</g>
    )
  ) : null

  // Windowed Lines laid back over Masked Text, at their own strength.
  const linesAndMasked = drawn ? (
    <>
      {composite}
      {linesBack > 0 ? <g opacity={linesBack}>{maskedBand}</g> : null}
    </>
  ) : null

  const finalArt = (
    <>
      {rawText === 'under' ? plain : null}
      {linesAndMasked}
      {rawText === 'over' ? plain : null}
    </>
  )

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
          </Node>
          <Node title="Text" kind="input" preview={<Shot drawn={drawn} paper={paper}>{plain}</Shot>}>
            <input value={text} onChange={(e) => setText(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            <Slider label="size" value={size} min={24} max={200} step={1} onChange={setSize} />
            <Slider label="font weight" value={weight} min={100} max={900} step={100} onChange={setWeight} />
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
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
          </Node>
          <Node
            title="Text as Lines"
            kind="combine"
            from={['Text']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {drawn ? <path d={drawn.words} fill={ink} /> : null}
              </Shot>
            }
          >
            <p className="text-xs text-muted-foreground">The words redrawn as lines by the engine. Thick where the letters are.</p>
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
            title="Masked Text"
            kind="combine"
            from={['Windowed Lines', textFrom === 'plain' ? 'Text' : 'Text as Lines']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {composite}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">text is</span>
              <select value={textFrom} onChange={(e) => setTextFrom(e.target.value as 'plain' | 'lines')} className="rounded border px-1 py-0.5">
                <option value="plain">the plain words</option>
                <option value="lines">the words as lines</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">shown</span>
              <select value={blend} onChange={(e) => setBlend(e.target.value as 'over' | 'through' | 'outside')} className="rounded border px-1 py-0.5">
                <option value="through">only in the lines</option>
                <option value="outside">only between the lines</option>
                <option value="over">no mask: stacked</option>
              </select>
            </label>
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
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
            <p className="text-xs text-muted-foreground">Windowed Lines laid back over Masked Text. 0 leaves Masked Text alone.</p>
          </Node>
        </Column>

        <Arrow />

        <Column>
          <Node
            title="Final"
            kind="output"
            from={['Masked Text + Lines', 'Text']}
            preview={
              <Shot drawn={drawn} paper={paper}>
                {defs}
                {finalArt}
              </Shot>
            }
          >
            <label className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground">raw text</span>
              <select value={rawText} onChange={(e) => setRawText(e.target.value as 'under' | 'over' | 'off')} className="rounded border px-1 py-0.5">
                <option value="under">under the lines</option>
                <option value="over">over the lines</option>
                <option value="off">off</option>
              </select>
            </label>
          </Node>
        </Column>
      </div>
    </main>
  )
}
