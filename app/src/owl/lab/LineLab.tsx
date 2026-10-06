import { useLayoutEffect, useRef, useState } from 'react'
import { linesFromGrid, rasterizeText, UNIT_PX } from '@/hub/textLines'

/**
 * The line compositing builder (2026-10-05), built from the ground up. Step one is the floor:
 *
 *  1. A base layer: any text, drawn as lines by the same engine as the hub title.
 *  2. A band layer: one even weight of lines over the whole box, blind to the words.
 *  3. A window on the band: a left and a right edge, which you drag by hand. No clock yet, so
 *     the motion is yours to find before it is anyone's to code.
 *
 * Nothing here animates. Each next step (more layers, edge shapes, a timeline) is added only when
 * the one before reads right to Thomas.
 */

type Drawn = { words: string; band: string; w: number; h: number }

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
      <span className="w-12 tabular-nums">{value}</span>
    </label>
  )
}

export default function LineLab() {
  const [text, setText] = useState('I am RAGtime')
  const [size, setSize] = useState(96)
  const [weight, setWeight] = useState(800)
  const [pitch, setPitch] = useState(3.6)
  const [ink, setInk] = useState('#1b2a49')
  const [paper, setPaper] = useState('#fffdf2')
  const [bandOn, setBandOn] = useState(true)
  const [cover, setCover] = useState(0.55)
  const [left, setLeft] = useState(0.2)
  const [right, setRight] = useState(0.5)
  const [wordsMode, setWordsMode] = useState<'always' | 'behind'>('always')

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

  return (
    <main className="mx-auto max-w-[70rem] px-6 py-8" data-line-lab>
      <h1 className="text-lg font-semibold">Line compositing builder</h1>
      <p className="mb-6 text-sm text-muted-foreground">Step one: a base layer, a band layer, and a window you drag. No motion yet.</p>

      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Base: text</h2>
          <input value={text} onChange={(e) => setText(e.target.value)} className="rounded border px-2 py-1 text-sm" />
          <Slider label="size" value={size} min={24} max={200} step={1} onChange={setSize} />
          <Slider label="weight" value={weight} min={100} max={900} step={100} onChange={setWeight} />
          <Slider label="line pitch" value={pitch} min={1.5} max={8} step={0.1} onChange={setPitch} />
          <label className="flex items-center gap-2 text-xs">
            <span className="w-28 text-muted-foreground">ink / paper</span>
            <input type="color" value={ink} onChange={(e) => setInk(e.target.value)} />
            <input type="color" value={paper} onChange={(e) => setPaper(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="w-28 text-muted-foreground">words show</span>
            <select value={wordsMode} onChange={(e) => setWordsMode(e.target.value as 'always' | 'behind')} className="rounded border px-1 py-0.5">
              <option value="always">always</option>
              <option value="behind">only behind the window</option>
            </select>
          </label>

          <h2 className="mt-4 text-sm font-medium">Layer: band</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bandOn} onChange={(e) => setBandOn(e.target.checked)} />
            on
          </label>
          <Slider label="band weight" value={cover} min={0.05} max={1} step={0.05} onChange={setCover} />
          <Slider label="window left" value={left} min={0} max={1} step={0.005} onChange={setLeft} />
          <Slider label="window right" value={right} min={0} max={1} step={0.005} onChange={setRight} />
        </section>

        <section className="overflow-auto rounded-md border p-6" style={{ background: paper }}>
          <div
            ref={host}
            className="relative inline-block whitespace-nowrap leading-tight"
            style={{ fontFamily: 'Lato, sans-serif', fontSize: size, fontWeight: weight, color: ink }}
          >
            {text}
            {drawn ? (
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0"
                width={drawn.w}
                height={drawn.h}
                viewBox={`0 0 ${vw} ${vh}`}
                style={{ overflow: 'visible', background: paper }}
              >
                <defs>
                  <clipPath id="line-lab-window">
                    <rect x={vw * lo} y={0} width={vw * (hi - lo)} height={vh} />
                  </clipPath>
                  <clipPath id="line-lab-behind">
                    <rect x={0} y={0} width={vw * lo} height={vh} />
                  </clipPath>
                </defs>
                <path d={drawn.words} fill={ink} clipPath={wordsMode === 'behind' ? 'url(#line-lab-behind)' : undefined} />
                {bandOn ? <path d={drawn.band} fill={ink} clipPath="url(#line-lab-window)" /> : null}
              </svg>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
