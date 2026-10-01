import { useId, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { partOrigins, type OWL_PARTS } from './parts'
import { enabledStanding } from './standing'
import type { LayerProps, OwlDesign, OwlLantern, OwlPose, OwlStyle } from './types'
import { tuneValue } from '@/tune/store'
import { motionStyle, searchVars } from './vars'

/**
 * The part of the owl no render style gets to vary: the root element, the eyes and the
 * pupils, the glow, the gradient it paints with, the lantern state, and the part groups
 * (`parts.ts`) that every layer a style draws is placed in.
 *
 * It exists so the DOM contract (`contract.ts`) is written once. The stage's mirror, the
 * gaze, the blink and the lantern's glow all find the owl by these elements and
 * attributes; a style that drew its own would have to remember every one of them, and
 * the first one that forgot would break a page nobody was looking at. A style draws the
 * body in the layers `OwlStyle` names and this paints around them, in this order:
 *
 *   ground → body → head → eyes, pupils, rims → `eyeDetail` → beak → belly → wings → glow → `lantern`
 *
 * which is the order the concept sheet was drawn in; a style with `headLast` has the head
 * group after the wings instead (`types.ts` says why).
 * The groups are how a head moves as a head. The head, the face, the eyes, the rims, the
 * lids and the beak are drawn by different layers, some by the style and some here; the
 * `head` group holds them all, and its pivot is the neck, so one transform on it moves
 * every one of them together in every style. They are plain groups with no paint of their
 * own, so an owl with no standing behaviour draws exactly what it drew without them.
 */

type PartName = (typeof OWL_PARTS)[number]

function Part({ name, origins, children }: { name: PartName; origins: Record<PartName, string>; children: ReactNode }) {
  // `transform-origin` as an attribute: the pivot is data about the figure, so it is in the
  // figure, and a stylesheet that wanted another could still override it.
  return (
    // (React knows the attribute as `transformOrigin`; the typings for SVG groups do not.)
    <g data-part={name} {...({ transformOrigin: origins[name] } as object)}>
      {children}
    </g>
  )
}

export function OwlDrawing({
  design,
  poseId,
  lantern,
  renderStyle,
  svgRef,
  className,
  style,
  title,
}: {
  design: OwlDesign
  poseId: OwlPose
  /** The lantern state to show, after the night hours have been applied. */
  lantern: OwlLantern
  renderStyle: OwlStyle
  svgRef: RefObject<SVGSVGElement | null>
  className?: string
  /** Merged under the design's own custom properties, which win. */
  style?: CSSProperties
  title?: string
}) {
  const pose = design.poses[poseId]
  const { palette, stroke, shape } = design
  const layer: LayerProps = { design, poseId, pose }
  const { defs: Defs, frame: Frame, ground: Ground, body: Body, head: Head, eyeDetail: EyeDetail, beak: Beak, belly: Belly, wing: Wing, lantern: Lantern } = renderStyle
  // One gradient per owl, named per owl: two on a page sharing an id would both paint
  // with whichever the document found first.
  const glow = 'owl-glow-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const flame = {
    cx: pose.lantern.flame.x + pose.lantern.flame.width / 2,
    cy: pose.lantern.flame.y + pose.lantern.flame.height / 2,
  }
  const standing = enabledStanding(design.standing).join(' ')
  const { eyes } = pose
  const origins = partOrigins(pose)
  const wrap = (children: ReactNode) => (Frame ? <Frame {...layer}>{children}</Frame> : children)

  const head = (
    <Part name="head" origins={origins}>
      <Head {...layer} />
      <Part name="features" origins={origins}>
        {/* The lenses and the pupils close together and the rims do not: a blink that
            squashed the spectacles with the eyes behind them would be the owl taking its
            glasses off every six seconds. So what the concept draws as one circle with a
            stroke is two here — the fill, which blinks, and the rim over it, which stays.
            At rest the two are the concept's circle exactly. */}
        <g className="owl-eyes">
          <circle cx={eyes.left} cy={eyes.cy} r={eyes.r} fill={palette.lens} />
          <circle cx={eyes.right} cy={eyes.cy} r={eyes.r} fill={palette.lens} />
          <g className="owl-pupils">
            <circle cx={eyes.left} cy={eyes.cy} r={eyes.pupil} fill={palette.pupil} />
            <circle cx={eyes.right} cy={eyes.cy} r={eyes.pupil} fill={palette.pupil} />
          </g>
        </g>
        <circle className="owl-rim" cx={eyes.left} cy={eyes.cy} r={eyes.r} fill="none" stroke={palette.gold} strokeWidth={stroke.rim} />
        <circle className="owl-rim" cx={eyes.right} cy={eyes.cy} r={eyes.r} fill="none" stroke={palette.gold} strokeWidth={stroke.rim} />
        {EyeDetail ? <EyeDetail {...layer} /> : null}
        <Beak {...layer} />
      </Part>
    </Part>
  )
  const chest = (
    <>
      <Part name="belly" origins={origins}>
        <Belly {...layer} />
      </Part>
      <Part name="wing-l" origins={origins}>
        <Wing {...layer} side="l" />
      </Part>
      <Part name="wing-r" origins={origins}>
        <Wing {...layer} side="r" />
      </Part>
    </>
  )

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-owl={poseId}
      data-lantern={lantern}
      data-blink={design.motion.blink ? undefined : 'off'}
      data-standing={standing === '' ? undefined : standing}
      className={className ? 'owl ' + className : 'owl'}
      style={{ ...style, ...motionStyle(design.motion), ...(searchVars(tuneValue) as CSSProperties) }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" stopColor={palette.flame} stopOpacity={shape.glowCore} />
          <stop offset="1" stopColor={palette.flame} stopOpacity="0" />
        </radialGradient>
        {Defs ? <Defs {...layer} /> : null}
      </defs>
      {wrap(
        <Part name="page" origins={origins}>
          <Part name="ground" origins={origins}>
            <Ground {...layer} />
          </Part>
          <Part name="figure" origins={origins}>
            <Part name="body" origins={origins}>
              <Body {...layer} />
            </Part>
            {renderStyle.headLast ? null : head}
            {chest}
            {renderStyle.headLast ? head : null}
            <Part name="lantern" origins={origins}>
              {/* Under the lantern and over the owl, so a lit lantern lights the wing that holds
                  it. Always in the document and transparent while dark, so lighting it is a
                  change of ink and nothing is added to or taken from the figure. */}
              <circle className="owl-glow" cx={flame.cx} cy={flame.cy} r={shape.glowRadius} fill={`url(#${glow})`} />
              <Lantern {...layer} />
            </Part>
          </Part>
        </Part>,
      )}
    </svg>
  )
}
