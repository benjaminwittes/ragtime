import { Owl } from '../../Owl'
import type { OwlLantern, OwlPin } from '../../types'
import { variantList } from '../../variants'

/**
 * The contact sheet: every variant once, in the stacks pose, on the site's paper. Each
 * variant is one row of two groups: the size steps (the owl is mounted at 56 to 112px on
 * real pages, and the largest step is for looking at the line work), then the three
 * lantern states side by side at one size.
 *
 * Moving owls are what makes a page heavy, and under the scan finish every step of a
 * stepped behaviour re-runs a filter, so a row of seven would cost more than the rest of
 * the lab together. One specimen per variant, the lit one at the size the pages mount,
 * carries the variant's own motion; every other specimen is held still and its caption
 * says "still". The stills are the same drawing: only the movement is left off, and that
 * includes the eyes following the pointer, which also re-runs a filter.
 */

const SIZES = [56, 80, 112, 240]
const STATE_SIZE = 112
/** The lit state is the state-size step of the first group, so it is not drawn twice. */
const LANTERNS: OwlLantern[] = ['dark', 'searching']

/** The specimen that moves: the lit one at the state size. */
const MOVING = { size: STATE_SIZE, lantern: 'lit' } as const

/** No standing behaviour, no blink, and the eyes do not follow the pointer: nothing inside the figure changes. */
const STILL: OwlPin = { design: { temperament: null, standing: {}, motion: { blink: false, gazeFollow: false } } }

function Figure({ variant, lantern, size, label }: { variant: string; lantern: OwlLantern; size: number; label: string }) {
  const moving = lantern === MOVING.lantern && size === MOVING.size && label === 'size'
  return (
    <figure className="m-0">
      <div style={{ width: size }}>
        <Owl
          pose="stacks"
          lantern={lantern}
          variant={variant}
          pin={moving ? undefined : STILL}
          className={moving ? 'w-full' : 'w-full lab-still'}
        />
      </div>
      <figcaption className="mt-1 text-xs text-muted-foreground">
        {label === 'size' ? size + 'px' : lantern}
        {moving ? ', moving' : ', still'}
      </figcaption>
    </figure>
  )
}

export function SheetSection() {
  return (
    <>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        Stacks pose, on paper. Left: the size steps, lit. Right: the dark and the searching lantern at {STATE_SIZE}px (the lit one is the{' '}
        {STATE_SIZE}px step). The lit{' '}
        {STATE_SIZE}px owl in each row is the one that moves, with the variant&rsquo;s own behaviour; the others are held
        still, and say so, to keep the page light.
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
                <Figure key={size} variant={variant.id} lantern="lit" size={size} label="size" />
              ))}
            </div>
            <div className="flex items-end gap-6 border-l pl-10">
              {LANTERNS.map((lantern) => (
                <Figure key={lantern} variant={variant.id} lantern={lantern} size={STATE_SIZE} label="state" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
