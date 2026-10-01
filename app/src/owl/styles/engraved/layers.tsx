import { createContext, createElement, useContext, useId, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { LayerProps, WingSide } from '../../types'
import './engraved.css'
import { buildPlate, type Plate, type PlateGroup } from './plate'
import { resolveEngraved, type EngravedSettings } from './resolve'
import { scanFilter, type Prim } from './scan'
import { useFigurePx } from './size'

/**
 * The engraved style's layers. The drawing itself is `plate.ts`, which returns path data;
 * this file turns it into elements and decides nothing about how it looks.
 *
 * The plate is built once, by `Frame`, which wraps the whole figure so that the scan filter
 * acts on the eyes and the glow too, and handed down by context. Each layer the style
 * supplies prints the regions of the plate that belong to its part of the figure, in one
 * group per region with a stable class (`eng-body`, `eng-head`, `eng-face`, `eng-belly`,
 * `eng-wing-l`, `eng-wing-r`, `eng-beak`, `eng-books`, `eng-ground`), which is how the
 * scaffold's part groups (`../../parts.ts`) can move the head as one thing: the head
 * layer prints `eng-head` and `eng-face`, the scaffold puts the eyes and the beak in with
 * them. The lantern's regions are its own layer, since it has to sit over the glow.
 */

type Print = { plate: Plate; ink: string; paper: string; scanned: boolean }

const PlateContext = createContext<Print | null>(null)

function usePrint(): Print | null {
  return useContext(PlateContext)
}

function useSettings(design: LayerProps['design']): EngravedSettings {
  return useMemo(() => resolveEngraved(design), [design])
}

function usePlate({ design, poseId }: LayerProps, settings: EngravedSettings, px: number): Plate {
  const { params } = settings
  return useMemo(
    () => buildPlate({ pose: design.poses[poseId], shape: design.shape, palette: design.palette, params, px }),
    [design.poses, poseId, design.shape, design.palette, params, px],
  )
}

function Region({ group, ink }: { group: PlateGroup; ink: string }) {
  return (
    <g className={'eng-' + group.id}>
      {group.screen ? <path className="eng-lines" d={group.screen} fill={ink} /> : null}
      {group.hatch ? <path className="eng-hatch" d={group.hatch} fill={ink} /> : null}
      {group.key ? (
        <path
          className="eng-key"
          d={group.key}
          fill="none"
          stroke={ink}
          strokeWidth={group.keyWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </g>
  )
}

/** The paper the print sits on: the scanner's paper when the scan is on. */
function paperOf(settings: EngravedSettings): string {
  return settings.scan.on ? settings.scan.paperTone : settings.params.paper
}

export function Frame(props: LayerProps & { children: ReactNode }) {
  const { design, children } = props
  const settings = useSettings(design)
  const { params, scan } = settings
  const id = 'eng-scan-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const anchor = useRef<SVGGElement>(null)
  const px = useFigurePx(anchor)
  const filter = useMemo(() => (scan.on ? scanFilter(scan, params, px || 320) : null), [scan, params, px])
  const plate = usePlate(props, settings, px)
  const print = useMemo(
    () => ({ plate, ink: params.ink, paper: paperOf(settings), scanned: settings.scan.on }),
    [plate, params.ink, settings],
  )
  return (
    <>
      {filter ? (
        <defs>
          {createElement(
            'filter',
            {
              id,
              filterUnits: 'userSpaceOnUse',
              colorInterpolationFilters: 'sRGB',
              x: filter.region.x,
              y: filter.region.y,
              width: filter.region.width,
              height: filter.region.height,
            },
            ...filter.prims.map(render),
          )}
        </defs>
      ) : null}
      <g
        ref={anchor}
        className="eng-frame"        style={{ '--eng-ink': params.ink, '--eng-paper': paperOf(settings) } as CSSProperties}
        filter={filter ? `url(#${id})` : undefined}
        transform={scan.on && scan.skew !== 0 ? `rotate(${scan.skew} 50 50)` : undefined}
      >
        <PlateContext.Provider value={print}>{children}</PlateContext.Provider>
      </g>
    </>
  )
}

function render(prim: Prim, index: number): ReactNode {
  return createElement(prim.tag, { key: index, ...prim.attrs }, ...(prim.children ?? []).map(render))
}

/** The plate's regions with these ids, in plate order. */
function Regions({ ids }: { ids: readonly string[] }) {
  const print = usePrint()
  if (!print) return null
  return (
    <>
      {print.plate.groups
        .filter((g) => !g.lantern && ids.includes(g.id))
        .map((g) => (
          <Region key={g.id} group={g} ink={print.ink} />
        ))}
    </>
  )
}

/** The paper, the ground tint and the books. */
export function Ground({ design }: LayerProps) {
  const print = usePrint()
  return (
    <>
      {print && print.plate.ground !== 'none' ? (
        <circle className="eng-paper" cx="50" cy="50" r={design.shape.disc} fill={print.paper} />
      ) : null}
      <Regions ids={['ground', 'books']} />
    </>
  )
}

export function Body() {
  return <Regions ids={['body']} />
}

export function Head() {
  return <Regions ids={['head', 'face']} />
}

export function Beak() {
  return <Regions ids={['beak']} />
}

export function Belly() {
  return <Regions ids={['belly']} />
}

const WING_IDS = { l: ['wing-l'], r: ['wing-r'] } as const

export function Wing({ side }: LayerProps & { side: WingSide }) {
  return <Regions ids={WING_IDS[side]} />
}

/** A lid of short lines across the top of each lens: the one place the eyes are engraved. */
export function EyeDetail({ design, pose }: LayerProps) {
  const { params } = useSettings(design)
  const { eyes } = pose
  const lines = useMemo(() => {
    const out: { d: string; w: number }[] = []
    for (const cx of [eyes.left, eyes.right]) {
      for (let k = 0; k < 4; k++) {
        const dy = -eyes.r + 0.9 + k * 0.85
        const half = Math.sqrt(Math.max(0, eyes.r * eyes.r - dy * dy)) - 0.5
        if (half <= 0.5) continue
        out.push({ d: `M${(cx - half).toFixed(2)} ${(eyes.cy + dy).toFixed(2)}H${(cx + half).toFixed(2)}`, w: 0.42 - k * 0.07 })
      }
    }
    return out
  }, [eyes.left, eyes.right, eyes.cy, eyes.r])
  return (
    <g className="eng-lids" stroke={params.ink} strokeLinecap="round" fill="none">
      {lines.map((l) => (
        <path key={l.d} d={l.d} strokeWidth={l.w} />
      ))}
    </g>
  )
}

/** Wedges round (cx, cy): `n` of them from r0 out to r1 (every other one to r1 and the rest shorter by `short`). */
function wedgePaths(cx: number, cy: number, n: number, r0: number, r1: number, short: number, half: number, turn: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + turn
    const long = i % 2 === 0
    const end = long ? r1 : r1 - short
    const w = long ? half : half * 0.8
    const p = (r: number, da: number) => `${(cx + Math.cos(a + da) * r).toFixed(2)} ${(cy + Math.sin(a + da) * r).toFixed(2)}`
    out.push(`M${p(r0, -w)}L${p(end, 0)}L${p(r0, w)}Z`)
  }
  return out
}

/**
 * The light round the flame, in three parts that the stylesheet shows by lantern state:
 * the rays (lit and searching), a ring of outer rays and a wider cleared halo (searching
 * only), so a search differs from a lit lantern in the drawing and not only in motion.
 *
 * The rays are paper wedges with an ink edge so they read on dark and light alike. Under the
 * scan finish the edge is the thin part, and a 1-bit clip drops anything thinner than a pixel
 * of the copier, so `bold` draws heavier edges and fatter wedges there, and a disc of paper
 * is cut into the plate behind them (`eng-halo`): the light is then a clear patch in the
 * hatching, which the clip keeps whole.
 */
function Rays({ cx, cy, ink, paper, bold }: { cx: number; cy: number; ink: string; paper: string; bold: boolean }) {
  const half = bold ? 0.1 : 0.07
  const inner = useMemo(() => wedgePaths(cx, cy, 14, 9.6, 18, 4, half, 0.2), [cx, cy, half])
  const outer = useMemo(() => wedgePaths(cx, cy, 14, 19.6, 25, 2.2, half * 0.8, 0.2 + Math.PI / 14), [cx, cy, half])
  const stroke = bold ? 0.62 : 0.3
  return (
    <>
      <g className="eng-halo" fill={paper}>
        <circle className="eng-halo-lit" cx={cx} cy={cy} r={bold ? 11.5 : 0} />
        <circle className="eng-halo-search" cx={cx} cy={cy} r={bold ? 14.5 : 0} />
      </g>
      <g className="eng-rays" fill={paper} stroke={ink} strokeWidth={stroke} strokeLinejoin="round">
        {inner.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className="eng-rays-outer" fill={paper} stroke={ink} strokeWidth={Math.max(stroke, 0.45)} strokeLinejoin="round">
        {outer.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </>
  )
}

export function Lantern({ design, pose }: LayerProps) {
  const print = usePrint()
  if (!print) return null
  const { plate, ink, paper } = print
  const { handle, frame, flame } = pose.lantern
  const fx = flame.x + flame.width / 2
  const fy = flame.y + flame.height / 2
  const hw = Math.max(design.stroke.handle * 0.7, 1.2)
  return (
    <g className="eng-lantern-layer">
      <Rays cx={fx} cy={fy} ink={ink} paper={paper} bold={print.scanned} />
      <line x1={handle.x} y1={handle.y1} x2={handle.x} y2={handle.y2} stroke={paper} strokeWidth={hw + 1.4} />
      <line x1={handle.x} y1={handle.y1} x2={handle.x} y2={handle.y2} stroke={ink} strokeWidth={hw} />
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx={design.shape.lanternRadius}
        fill={paper}
      />
      {plate.groups
        .filter((g) => g.lantern)
        .map((g) => (
          <Region key={g.id} group={g} ink={ink} />
        ))}
      <path
        className="eng-flame owl-flame"
        d={`M${fx} ${flame.y + flame.height * 0.08}C${fx + flame.width * 0.55} ${flame.y + flame.height * 0.5} ${fx + flame.width * 0.38} ${flame.y + flame.height * 0.95} ${fx} ${flame.y + flame.height * 0.95}C${fx - flame.width * 0.38} ${flame.y + flame.height * 0.95} ${fx - flame.width * 0.55} ${flame.y + flame.height * 0.5} ${fx} ${flame.y + flame.height * 0.08}Z`}
        fill={ink}
      />
    </g>
  )
}
