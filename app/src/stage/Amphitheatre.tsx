import { useState, type CSSProperties, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { StageFloor } from './stageFloor.ts'

/** The tiers of seats, innermost first. Each is a ring of stone a step higher than the last. */
const TIERS = 15

/** Every measure of the theatre's plan, in `cqw` of the house it stands in. */
const PLAN = {
  /** The centre of the orchestra, on the ground. */
  cx: 50,
  cy: 63,
  /** The orchestra's radius: the circle of earth the seats curve round. */
  orchestra: 12.5,
  /** Where the first tier begins, how deep each tread is, and how high each one rises. */
  first: 14.5,
  tread: 3.3,
  rise: 1.25,
  /** How far past its own tread a tier runs on underneath the next one. See `.amp-tier`. */
  under: 2.6,
  /** How far behind the orchestra's centre line the seats stop: the theatre opens to the stage. */
  open: 4,
} as const

/**
 * The house: an open-air theatre, seen small.
 *
 * `/stage` is a seat in an audience, so this is the view from one — high in the cavea of
 * a theatre cut into a hillside, looking down over the curve of the seats and across the
 * orchestra to the stage. It is built, not pictured: the ground is one plane tipped back
 * under a real perspective, each tier is a ring of it a step higher than the last, and
 * the colonnade behind the stage is the mark's fluting (`components/Mark.tsx`) standing
 * up. Nothing here is an image, so it is the same theatre at any width.
 *
 * It is seen at the scale of a model, the way a tilt-shift lens shows a real place: from
 * above, with only the stage in focus and the near seats and the far hillside falling
 * soft. That is not only for charm. What stands on this stage is the record, and the
 * record is large; a theatre you could walk into would make a single document a monument.
 * A model on a table is the right size to look *at* a few dozen of them at once.
 *
 * Two distances. From far, the theatre sits small at the foot of the window and the words
 * of the presentation are set in the air above it. `near`, the view moves in until the
 * stage fills the width, and a search is brought on. The move between them is the only
 * thing here that animates by itself.
 */
export function Amphitheatre({
  near,
  fixed = false,
  children,
}: {
  near: boolean
  /** Fill the window and stay put while the words scroll, rather than fill the box it is in. */
  fixed?: boolean
  children?: ReactNode
}) {
  const [floor, setFloor] = useState<HTMLElement | null>(null)
  return (
    <StageFloor.Provider value={floor}>
      <div className={cn('amp', fixed ? 'fixed' : 'absolute')} data-near={near ? '' : undefined}>
        <div className="amp-view">
          <div className="amp-ground">
            <div className="amp-hill" />
            <div className="amp-skene" />
            <div className="amp-stage" ref={setFloor} />
            <div className="amp-apron" />
            <div className="amp-orchestra" />
            {Array.from({ length: TIERS }, (_, i) => {
              const inner = PLAN.first + i * PLAN.tread
              const outer = inner + PLAN.tread + PLAN.under
              return (
                <div
                  key={i}
                  className="amp-tier"
                  style={
                    {
                      '--r': `${outer}cqw`,
                      '--z': `${(i + 1) * PLAN.rise}cqw`,
                      // Where the tread starts and ends, as fractions of the ring's radius.
                      '--a': `${(inner / outer) * 100}%`,
                      '--b': `${((inner + PLAN.tread) / outer) * 100}%`,
                      '--cut': `${outer - PLAN.open}cqw`,
                    } as CSSProperties
                  }
                />
              )
            })}
          </div>
        </div>
        {/* The lens. Four bands of blur, two at the far edge and two at the near, each
            fading toward the stage: what is in focus is a strip across the middle. */}
        <div className="amp-soft" data-at="far" />
        <div className="amp-soft" data-at="farther" />
        <div className="amp-soft" data-at="near" />
        <div className="amp-soft" data-at="nearer" />
      </div>
      {children}
    </StageFloor.Provider>
  )
}
