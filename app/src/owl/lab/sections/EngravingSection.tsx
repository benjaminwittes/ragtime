import { useMemo, useRef } from 'react'
import { mergeDesign } from '../../resolve'
import { OwlDrawing } from '../../scaffold'
import { getStyle } from '../../styles'
// The lab shows every drawing, so it has them all before the first plate is laid (and none swaps in).
import '../../styles/all'
import type { OwlDesignPatch } from '../../types'
import { designFor, useTuneVersion } from '../../useOwlDesign'
import { variantList } from '../../variants'

/**
 * The engraving, made legible: each screen type alone, and the scan finish at a few
 * strengths. The variants themselves, and the size steps, are on the contact sheet. The
 * Tune panel's Owl tab moves every owl here at once.
 *
 * The owls here are drawn with the scaffold directly rather than `Owl`, because the
 * screen and the scan rows lay a patch over a variant that no variant file carries. They
 * are plates to be looked at, so they do not move (`lab-still`): a scan filter is re-run by
 * every change inside it.
 */

const PAPER = 'bg-background text-foreground'
const SIZE = 200

function Plate({ variant, patch, size }: { variant: string; patch?: OwlDesignPatch; size: number }) {
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
        poseId="stacks"
        lantern="lit"
        renderStyle={getStyle(design.style)}
        svgRef={ref}
        className="w-full lab-still"
      />
    </div>
  )
}

function Caption({ children }: { children: string }) {
  return <div className="mt-1 max-w-[16rem] text-xs opacity-70">{children}</div>
}

function firstEngraved() {
  return variantList().find((v) => v.design.style === 'engraved')
}

const SCREENS: { id: string; label: string; patch: NonNullable<OwlDesignPatch['params']> }[] = [
  { id: 'straight', label: 'Straight', patch: { engraved: { screen: 'straight', hatch: 1 } } },
  { id: 'displaced', label: 'Displaced over the form', patch: { engraved: { screen: 'displaced', hatch: 1 } } },
  { id: 'contour', label: 'Contour', patch: { engraved: { screen: 'contour', hatch: 1 } } },
  { id: 'mixed', label: 'Mixed', patch: { engraved: { screen: 'mixed', hatch: 1 } } },
]

function Screens({ variant }: { variant: string }) {
  return (
    <div className={'mt-4 flex flex-wrap items-end gap-8 rounded-md border p-4 ' + PAPER}>
      {SCREENS.map((s) => (
        <div key={s.id}>
          <Plate variant={variant} patch={{ params: s.patch }} size={SIZE} />
          <Caption>{s.label}</Caption>
        </div>
      ))}
    </div>
  )
}

const SCANS: { id: string; label: string; engraved: Record<string, string | number | boolean> }[] = [
  { id: 'off', label: 'Clean print', engraved: { scan: false } },
  { id: 'copy', label: 'One copy: 1-bit, speckled', engraved: { scan: true } },
  { id: 'worn', label: 'Worn: harder, more noise, skewed', engraved: { scan: true, scanSpread: 0.2, scanWobble: 0.7, scanHardness: 1, scanSpeckle: 0.5, scanDropout: 0.5, scanThreshold: 0.56, scanSkew: -1.2 } },
  { id: 'gen4', label: 'Copied four times', engraved: { scan: true, scanGenerations: 4, scanSpread: 0.1, scanWobble: 0.5, scanHardness: 1, scanSpeckle: 0.25, scanDropout: 0.25, scanThreshold: 0.58, scanSkew: -1.5 } },
]

function Scans({ variant }: { variant: string }) {
  return (
    <div className={'mt-4 flex flex-wrap items-end gap-8 rounded-md border p-4 ' + PAPER}>
      {SCANS.map((s) => (
        <div key={s.id}>
          <Plate variant={variant} patch={{ params: { engraved: s.engraved } }} size={SIZE} />
          <Caption>{s.label}</Caption>
        </div>
      ))}
    </div>
  )
}

export function EngravingSection() {
  const variant = firstEngraved()
  if (!variant) return null
  return (
    <>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        Both rows are <code>{variant.id}</code>, stacks pose, lit.
      </p>
      <h3 className="mt-6 font-serif text-xl font-medium">Screens, one at a time</h3>
      <Screens variant={variant.id} />
      <h3 className="mt-10 font-serif text-xl font-medium">The scan finish, at rising strength</h3>
      <Scans variant={variant.id} />
    </>
  )
}
