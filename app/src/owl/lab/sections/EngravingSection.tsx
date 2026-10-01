import { useMemo, useRef } from 'react'
import { mergeDesign } from '../../resolve'
import { OwlDrawing } from '../../scaffold'
import { getStyle } from '../../styles'
import type { OwlDesignPatch, OwlLantern, OwlPose } from '../../types'
import { designFor, useTuneVersion } from '../../useOwlDesign'
import { variantList } from '../../variants'

/**
 * The engraving, made legible: the engraved variants large, the size ladder that shows
 * what the style does as the figure shrinks, each screen type alone, and the scan finish
 * at rising strength. The Tune panel's Owl tab moves every owl here at once.
 *
 * The owls here are drawn with the scaffold directly rather than `Owl`, because the
 * screen and the scan rows lay a patch over a variant that no variant file carries.
 */

const PAPER = 'bg-background text-foreground'
const DARK = 'bg-[#10162a] text-[#e9dfc8]'

function Plate({
  variant,
  patch,
  pose = 'archivist',
  lantern = 'dark',
  size,
}: {
  variant: string
  patch?: OwlDesignPatch
  pose?: OwlPose
  lantern?: OwlLantern
  size: number
}) {
  const version = useTuneVersion()
  const ref = useRef<SVGSVGElement>(null)
  const design = useMemo(
    () => mergeDesign(designFor(variant), patch),
    // The tuned values are read through the store; the version is what says they moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant, patch, version],
  )
  return (
    <div style={{ width: size }}>
      <OwlDrawing
        design={design}
        poseId={pose}
        lantern={lantern}
        renderStyle={getStyle(design.style)}
        svgRef={ref}
        className="w-full"
      />
    </div>
  )
}

function Caption({ children }: { children: string }) {
  return <div className="mt-1 max-w-[16rem] text-xs opacity-70">{children}</div>
}

function engravedVariants() {
  return variantList().filter((v) => v.design.style === 'engraved')
}

function Large() {
  const variants = engravedVariants()
  return (
    <div className="mt-4 space-y-8">
      {variants.map((v) => (
        <div key={v.id}>
          <h3 className="font-serif text-xl font-medium">
            {v.label} <code className="text-sm font-normal text-muted-foreground">{v.id}</code>
          </h3>
          {v.note ? <p className="text-sm text-muted-foreground">{v.note}</p> : null}
          <div className={'mt-3 flex flex-wrap items-end gap-8 rounded-md border p-4 ' + PAPER}>
            <Plate variant={v.id} size={320} />
            <Plate variant={v.id} pose="stacks" size={320} />
            <div className="space-y-4">
              <Plate variant={v.id} lantern="lit" size={160} />
              <Plate variant={v.id} pose="stacks" lantern="searching" size={160} />
            </div>
            <div className={'rounded p-3 ' + DARK}>
              <Plate variant={v.id} size={200} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const LADDER = [24, 32, 48, 56, 64, 80, 96, 112, 160, 240]

function Ladder() {
  const v = engravedVariants()[0]
  if (!v) return null
  return (
    <div className="mt-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        The same plate at the sizes the owl is drawn, in CSS pixels. The style measures the figure and
        coarsens its screen so a line is never finer than a device pixel can hold: fewer, heavier lines, no
        cross-hatch, a keyline that holds at one pixel. The embeds are 48 to 112.
      </p>
      {[v, ...engravedVariants().slice(1, 3)].map((variant) => (
        <div key={variant.id} className={'mt-3 overflow-x-auto rounded-md border p-4 ' + PAPER}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-70">{variant.label}</div>
          <div className="flex items-end gap-5">
            {LADDER.map((size) => (
              <div key={size}>
                <Plate variant={variant.id} size={size} />
                <Caption>{size + 'px'}</Caption>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-end gap-5">
            {LADDER.map((size) => (
              <div key={size}>
                <Plate variant={variant.id} pose="stacks" size={size} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const SCREENS: { id: string; label: string; patch: NonNullable<OwlDesignPatch['params']> }[] = [
  { id: 'straight', label: 'Straight', patch: { engraved: { screen: 'straight', hatch: 1 } } },
  { id: 'straight-hatch', label: 'Straight, cross-hatched', patch: { engraved: { screen: 'straight', hatch: 0.66 } } },
  { id: 'displaced', label: 'Displaced over the form', patch: { engraved: { screen: 'displaced', hatch: 1 } } },
  { id: 'displaced-hatch', label: 'Displaced, cross-hatched', patch: { engraved: { screen: 'displaced', hatch: 0.66 } } },
  { id: 'contour', label: 'Contour', patch: { engraved: { screen: 'contour', hatch: 1 } } },
  { id: 'mixed', label: 'Mixed', patch: { engraved: { screen: 'mixed', hatch: 1 } } },
]

function Screens() {
  const v = engravedVariants()[0]
  if (!v) return null
  return (
    <div className="mt-4">
      <div className={'flex flex-wrap items-end gap-8 rounded-md border p-4 ' + PAPER}>
        {SCREENS.map((s) => (
          <div key={s.id}>
            <Plate variant={v.id} patch={{ params: s.patch }} size={240} />
            <Caption>{s.label}</Caption>
          </div>
        ))}
      </div>
    </div>
  )
}

const SCANS: { id: string; label: string; engraved: Record<string, string | number | boolean> }[] = [
  { id: 'off', label: 'Clean print', engraved: { scan: false } },
  { id: 'faint', label: 'Faint: a little spread and wobble', engraved: { scan: true, scanSpread: 0.1, scanWobble: 0.2, scanHardness: 0.3, scanSpeckle: 0.05, scanDropout: 0.05 } },
  { id: 'copy', label: 'One copy: 1-bit, speckled', engraved: { scan: true } },
  { id: 'worn', label: 'Worn: harder, more noise, skewed', engraved: { scan: true, scanSpread: 0.3, scanWobble: 0.7, scanHardness: 1, scanSpeckle: 0.5, scanDropout: 0.4, scanSkew: -1.2 } },
  { id: 'gen2', label: 'Copied twice', engraved: { scan: true, scanGenerations: 2, scanSkew: 0.8 } },
  { id: 'gen4', label: 'Copied four times', engraved: { scan: true, scanGenerations: 4, scanSpread: 0.14, scanThreshold: 0.55, scanSkew: -1.5 } },
]

function Scans() {
  const v = engravedVariants()[0]
  if (!v) return null
  return (
    <div className="mt-4">
      <div className={'flex flex-wrap items-end gap-8 rounded-md border p-4 ' + PAPER}>
        {SCANS.map((s) => (
          <div key={s.id}>
            <Plate variant={v.id} patch={{ params: { engraved: s.engraved } }} size={240} />
            <Caption>{s.label}</Caption>
          </div>
        ))}
      </div>
      <div className={'mt-4 flex flex-wrap items-end gap-6 rounded-md border p-4 ' + PAPER}>
        {[32, 48, 64, 96, 128].map((size) => (
          <div key={size}>
            <Plate variant={v.id} patch={{ params: { engraved: SCANS[3].engraved } }} size={size} />
            <Caption>{'worn, ' + size + 'px'}</Caption>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EngravingSection() {
  return (
    <>
      <h3 className="mt-6 font-serif text-xl font-medium">The variants, large</h3>
      <Large />
      <h3 className="mt-10 font-serif text-xl font-medium">Size ladder</h3>
      <Ladder />
      <h3 className="mt-10 font-serif text-xl font-medium">Screens, one at a time</h3>
      <Screens />
      <h3 className="mt-10 font-serif text-xl font-medium">The scan finish, at rising strength</h3>
      <Scans />
    </>
  )
}
