import { useMemo, useState } from 'react'
import { Owl } from '../../Owl'
import { standingList } from '../../standing'
import { temperamentList } from '../../temperaments'
import type { OwlPin } from '../../types'

/**
 * What the owl does when it stands there: each behaviour once, each temperament once, a
 * short row at real embed sizes (which is also three owls that are not in step). The print
 * temperament is shown once, on the scan finish, in the temperaments row. The stacks pose and the
 * site's own paper only, and about twenty-five owls in all, because every one of them is moving.
 *
 * Every owl here is pinned (`Owl`'s `pin`), so the Tune panel's standing knobs move the
 * rest of the page and leave these as labelled. The behaviours that belong to the print
 * (`boil`, `hatch-breath`, `flicker`, `toner`, `light-bar`) are shown on the engraved style,
 * the rest on the flat one.
 */

const PRINT = new Set(['boil', 'hatch-breath', 'flicker', 'toner', 'light-bar'])

function Specimen({ pin, variant, size, caption }: { pin: OwlPin; variant: string; size: number; caption: string }) {
  return (
    <figure style={{ width: Math.max(size, 120) }} className="text-xs">
      <div style={{ width: size }}>
        <Owl pose="stacks" lantern="lit" variant={variant} pin={pin} className="w-full" />
      </div>
      <figcaption className="mt-1 opacity-70">{caption}</figcaption>
    </figure>
  )
}

export function StandingSection() {
  const [big, setBig] = useState(false)
  const amount = big ? 2.5 : 1

  const behaviours = useMemo(
    () =>
      standingList().map((b) => ({
        b,
        pin: {
          design: { temperament: null, standing: { [b.id]: true } },
          knobs: { [`owl.standing.${b.id}.amount`]: amount },
        } satisfies OwlPin,
      })),
    [amount],
  )
  const temperaments = useMemo(
    () =>
      temperamentList().map((t) => ({
        t,
        pin: { design: { temperament: t.id, standing: {} } } satisfies OwlPin,
      })),
    [],
  )
  const watchful = useMemo(() => ({ design: { temperament: 'watchful', standing: {} } }) satisfies OwlPin, [])

  return (
    <div className="mt-4 space-y-10">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Behaviours are off in the default owl. The panel&rsquo;s Owl tab has a Standing group: a temperament, a
        master switch, and a switch, an amount and a period for each behaviour. Nothing here moves for a reader
        who has asked for reduced motion.
      </p>

      <div>
        <h3 className="font-serif text-xl font-medium">Each behaviour, alone</h3>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={big} onChange={(e) => setBig(e.target.checked)} />
          Exaggerate (amount 2.5), to see what each one does
        </label>
        <div className="mt-3 flex flex-wrap items-start gap-6 rounded-md border bg-background p-4 text-foreground">
          {behaviours.map(({ b, pin }) => (
            <Specimen
              key={b.id}
              pin={pin}
              variant={PRINT.has(b.id) ? 'engraved-line' : 'base'}
              size={128}
              caption={`${b.label}: ${b.note}`}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-serif text-xl font-medium">Temperaments</h3>
        <div className="mt-3 flex flex-wrap items-start gap-6 rounded-md border bg-background p-4 text-foreground">
          {temperaments.map(({ t, pin }) => (
            <Specimen
              key={t.id}
              pin={pin}
              variant={t.id === 'print' ? 'engraved-copy' : 'base'}
              size={160}
              caption={`${t.label}: ${t.note}`}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-serif text-xl font-medium">At embed sizes, not in step</h3>
        <div className="mt-3 flex flex-wrap items-end gap-8 rounded-md border bg-background p-4 text-foreground">
          {[48, 96, 112].map((size) => (
            <Specimen key={size} pin={watchful} variant="base" size={size} caption={`Watchful, ${size}px`} />
          ))}
        </div>
      </div>
    </div>
  )
}
