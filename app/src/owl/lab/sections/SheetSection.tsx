import { Owl } from '../../Owl'
import type { OwlLantern, OwlPose } from '../../types'
import { variantList } from '../../variants'

/**
 * The contact sheet: every variant, in every pose and lantern state, at six sizes, on
 * the site's paper and on a dark ground. The sizes run from a line of text (24px) to the
 * largest an owl is drawn at in a hero.
 */

const POSES: OwlPose[] = ['archivist', 'stacks']
const LANTERNS: OwlLantern[] = ['dark', 'lit', 'searching']
const SIZES = [24, 48, 96, 160, 240, 320]

const GROUNDS = [
  { id: 'paper', label: 'Paper', className: 'bg-background text-foreground' },
  { id: 'dark', label: 'Dark', className: 'bg-[#10162a] text-[#e9dfc8]' },
]

function Panel({ ground, variant }: { ground: (typeof GROUNDS)[number]; variant: string }) {
  return (
    <div className={'overflow-x-auto rounded-md border p-4 ' + ground.className}>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider opacity-70">{ground.label}</div>
      <table className="border-separate border-spacing-x-4 border-spacing-y-3 text-xs">
        <thead>
          <tr className="opacity-70">
            <th className="text-left font-normal">pose · lantern</th>
            {SIZES.map((size) => (
              <th key={size} className="text-left font-normal">
                {size}px
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {POSES.flatMap((pose) =>
            LANTERNS.map((lantern) => (
              <tr key={pose + lantern}>
                <th className="whitespace-nowrap text-left align-bottom font-normal">
                  {pose}
                  <br />
                  {lantern}
                </th>
                {SIZES.map((size) => (
                  <td key={size} className="align-bottom">
                    <div style={{ width: size }}>
                      <Owl pose={pose} lantern={lantern} variant={variant} className="w-full" />
                    </div>
                  </td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  )
}

export function SheetSection() {
  return (
    <>
      {variantList().map((variant) => (
        <div key={variant.id} className="mt-8">
          <h3 className="font-serif text-xl font-medium">
            {variant.label} <code className="text-sm font-normal text-muted-foreground">{variant.id}</code>
          </h3>
          {variant.note ? <p className="text-sm text-muted-foreground">{variant.note}</p> : null}
          <div className="mt-3 space-y-4">
            {GROUNDS.map((ground) => (
              <Panel key={ground.id} ground={ground} variant={variant.id} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
