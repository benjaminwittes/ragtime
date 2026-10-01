import { createElement, useId, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { LayerProps } from '../../types'
import './engraved.css'
import { buildPlate, type Plate, type PlateGroup } from './plate'
import { resolveEngraved, type EngravedSettings } from './resolve'
import { scanFilter, type Prim } from './scan'
import { useFigurePx } from './size'

/**
 * The engraved style's layers. The drawing itself is `plate.ts`, which returns path data;
 * this file turns it into elements and decides nothing about how it looks.
 *
 * Everything the plate prints goes into `behind`, in one group per region with a stable
 * class (`eng-body`, `eng-head`, `eng-face`, `eng-belly`, `eng-wing-l`, `eng-wing-r`,
 * `eng-beak`, `eng-books`, `eng-ground`), because none of it overlaps the eyes. Only the
 * lantern is in its own layer, since it has to sit over the glow. `frame` wraps the whole
 * figure so the scan filter acts on the eyes and the glow too.
 */

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

export function Frame({ design, children }: LayerProps & { children: ReactNode }) {
  const settings = useSettings(design)
  const { params, scan } = settings
  const id = 'eng-scan-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const anchor = useRef<SVGGElement>(null)
  const px = useFigurePx(anchor)
  const filter = useMemo(() => (scan.on ? scanFilter(scan, params, px || 320) : null), [scan, params, px])
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
        className="eng-frame"
        style={{ '--eng-ink': params.ink, '--eng-paper': paperOf(settings) } as CSSProperties}
        filter={filter ? `url(#${id})` : undefined}
        transform={scan.on && scan.skew !== 0 ? `rotate(${scan.skew} 50 50)` : undefined}
      >
        {children}
      </g>
    </>
  )
}

function render(prim: Prim, index: number): ReactNode {
  return createElement(prim.tag, { key: index, ...prim.attrs }, ...(prim.children ?? []).map(render))
}

export function Behind(props: LayerProps) {
  const { design } = props
  const settings = useSettings(design)
  const anchor = useRef<SVGGElement>(null)
  const px = useFigurePx(anchor)
  const plate = usePlate(props, settings, px)
  const { ink } = settings.params
  return (
    <g className="eng-plate" ref={anchor}>
      {plate.ground !== 'none' ? (
        <circle className="eng-paper" cx="50" cy="50" r={design.shape.disc} fill={paperOf(settings)} />
      ) : null}
      {plate.groups
        .filter((g) => !g.lantern)
        .map((g) => (
          <Region key={g.id} group={g} ink={ink} />
        ))}
    </g>
  )
}

/** The engraved owl keeps everything in `behind`; the beak, belly and wings are there. */
export function Front() {
  return null
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

/** Rays round the flame, drawn as paper wedges with an ink edge so they read on dark and light alike. */
function Rays({ cx, cy, ink, paper }: { cx: number; cy: number; ink: string; paper: string }) {
  const wedges = useMemo(() => {
    const out: string[] = []
    const n = 14
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2
      const long = i % 2 === 0
      const r0 = 9.6
      const r1 = long ? 18 : 14
      const half = long ? 0.07 : 0.055
      const p = (r: number, da: number) => `${(cx + Math.cos(a + da) * r).toFixed(2)} ${(cy + Math.sin(a + da) * r).toFixed(2)}`
      out.push(`M${p(r0, -half)}L${p(r1, 0)}L${p(r0, half)}Z`)
    }
    return out
  }, [cx, cy])
  return (
    <g className="eng-rays" fill={paper} stroke={ink} strokeWidth="0.3" strokeLinejoin="round">
      {wedges.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  )
}

export function Lantern(props: LayerProps) {
  const { design, pose } = props
  const settings = useSettings(design)
  const anchor = useRef<SVGGElement>(null)
  const px = useFigurePx(anchor)
  const plate = usePlate(props, settings, px)
  const { ink } = settings.params
  const paper = paperOf(settings)
  const { handle, frame, flame } = pose.lantern
  const fx = flame.x + flame.width / 2
  const fy = flame.y + flame.height / 2
  const hw = Math.max(design.stroke.handle * 0.7, 1.2)
  return (
    <g className="eng-lantern-layer" ref={anchor}>
      <Rays cx={fx} cy={fy} ink={ink} paper={paper} />
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
        className="eng-flame"
        d={`M${fx} ${flame.y + flame.height * 0.08}C${fx + flame.width * 0.55} ${flame.y + flame.height * 0.5} ${fx + flame.width * 0.38} ${flame.y + flame.height * 0.95} ${fx} ${flame.y + flame.height * 0.95}C${fx - flame.width * 0.38} ${flame.y + flame.height * 0.95} ${fx - flame.width * 0.55} ${flame.y + flame.height * 0.5} ${fx} ${flame.y + flame.height * 0.08}Z`}
        fill={ink}
      />
    </g>
  )
}
