import { Owl } from '../../Owl'
import type { OwlLantern } from '../../types'
import { variantList } from '../../variants'

/**
 * The contact sheet: every variant once, in the stacks pose, on the site's paper. Each
 * variant is one row of two groups: the size steps (the owl is mounted at 56 to 112px on
 * real pages, and the largest step is for looking at the line work), then the three
 * lantern states side by side at one size.
 */

const SIZES = [56, 80, 112, 240]
const STATE_SIZE = 112
const LANTERNS: OwlLantern[] = ['dark', 'lit', 'searching']

function Figure({ variant, lantern, size, caption }: { variant: string; lantern: OwlLantern; size: number; caption: string }) {
  return (
    <figure className="m-0">
      <div style={{ width: size }}>
        <Owl pose="stacks" lantern={lantern} variant={variant} className="w-full" />
      </div>
      <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

export function SheetSection() {
  return (
    <>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        Stacks pose, on paper. Left: the size steps, lit. Right: the three lantern states at {STATE_SIZE}px.
      </p>
      {variantList().map((variant) => (
        <div key={variant.id} className="mt-6">
          <h3 className="font-serif text-xl font-medium">
            {variant.label} <code className="text-sm font-normal text-muted-foreground">{variant.id}</code>
          </h3>
          {variant.note ? <p className="text-sm text-muted-foreground">{variant.note}</p> : null}
          <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-4 overflow-x-auto rounded-md border bg-background p-4 text-foreground">
            <div className="flex items-end gap-6">
              {SIZES.map((size) => (
                <Figure key={size} variant={variant.id} lantern="lit" size={size} caption={size + 'px'} />
              ))}
            </div>
            <div className="flex items-end gap-6 border-l pl-10">
              {LANTERNS.map((lantern) => (
                <Figure key={lantern} variant={variant.id} lantern={lantern} size={STATE_SIZE} caption={lantern} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
