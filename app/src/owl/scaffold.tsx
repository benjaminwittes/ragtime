import { useId, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { enabledStanding } from './standing'
import type { LayerProps, OwlDesign, OwlLantern, OwlPose, OwlStyle } from './types'
import { motionStyle } from './vars'

/**
 * The part of the owl no render style gets to vary: the root element, the eyes and the
 * pupils, the glow, the gradient it paints with, and the lantern state.
 *
 * It exists so the DOM contract (`contract.ts`) is written once. The stage's mirror, the
 * gaze, the blink and the lantern's glow all find the owl by these elements and
 * attributes; a style that drew its own would have to remember every one of them, and
 * the first one that forgot would break a page nobody was looking at. A style draws the
 * body in the layers `OwlStyle` names and this paints around them, in this order:
 *
 *   `defs` → `behind` → eyes, pupils, rims → `eyeDetail` → `front` → glow → `lantern`
 */
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
  const { defs: Defs, frame: Frame, behind: Behind, eyeDetail: EyeDetail, front: Front, lantern: Lantern } = renderStyle
  // One gradient per owl, named per owl: two on a page sharing an id would both paint
  // with whichever the document found first.
  const glow = 'owl-glow-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const flame = {
    cx: pose.lantern.flame.x + pose.lantern.flame.width / 2,
    cy: pose.lantern.flame.y + pose.lantern.flame.height / 2,
  }
  const standing = enabledStanding(design.standing).join(' ')
  const { eyes } = pose
  const wrap = (children: ReactNode) => (Frame ? <Frame {...layer}>{children}</Frame> : children)

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
      style={{ ...style, ...motionStyle(design.motion) }}
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
        <>
          <Behind {...layer} />
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
          <circle cx={eyes.left} cy={eyes.cy} r={eyes.r} fill="none" stroke={palette.gold} strokeWidth={stroke.rim} />
          <circle cx={eyes.right} cy={eyes.cy} r={eyes.r} fill="none" stroke={palette.gold} strokeWidth={stroke.rim} />
          {EyeDetail ? <EyeDetail {...layer} /> : null}
          <Front {...layer} />
          {/* Under the lantern and over the owl, so a lit lantern lights the wing that holds
              it. Always in the document and transparent while dark, so lighting it is a
              change of ink and nothing is added to or taken from the figure. */}
          <circle className="owl-glow" cx={flame.cx} cy={flame.cy} r={shape.glowRadius} fill={`url(#${glow})`} />
          <Lantern {...layer} />
        </>,
      )}
    </svg>
  )
}
