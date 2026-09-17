import type { ReactNode } from 'react'

/**
 * A surface saying what it is, and what it will cost you to use it.
 *
 * The hub opens with a title and an italic line naming everything it searches; the
 * Explorer's empty state opens with a title and a line saying that orient runs first and
 * costs almost nothing. Two surfaces, one move — and the reader who presses "Explorer"
 * sees the first replaced by the second in the same place on the screen. So it is one
 * component with two skins rather than two components that resemble each other, which is
 * also what lets the browser treat the two as one thing travelling (see the
 * `view-transition-name` below) instead of one picture dissolving into another.
 *
 * Headless, for the same reason {@link AskBox} is: half of its callers live inside
 * `.explorer`, whose scoped element rules beat the app's utilities there, so every class
 * name arrives from the caller. A `<section>` on both sides — the hub already used one,
 * and the Explorer's sheet has no bare-element rule for it, so the fused element costs
 * that surface nothing.
 */

type Props = {
  /**
   * `1` on a page whose whole subject this is, `2` inside one that already has an `h1`.
   * The Explorer's own `h1` is the screen-reader-only one in the site bar, so its empty
   * state opens at `h2` and the document keeps one top-level heading.
   */
  level: 1 | 2
  heading: ReactNode
  lede: ReactNode
  /** On the `<section>`. */
  className?: string
  headingClassName?: string
  ledeClassName?: string
}

export function SurfaceIntro({
  level,
  heading,
  lede,
  className,
  headingClassName,
  ledeClassName,
}: Props) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    // Named here rather than by each caller, so the pairing is one fact in one place and
    // cannot be half-applied. It is an inline style because a name is this element's
    // identity across a navigation rather than part of either skin, and because this
    // component is forbidden to ship a class name of its own.
    //
    // The pair does not always complete, and that is fine: the Explorer renders its empty
    // state only while the conversation is empty, so a reader who arrives with a
    // conversation already open gives the browser a `surface-intro` on the way out and
    // none on the way in. A group with only an old side simply leaves. Nothing downstream
    // may assume both halves exist.
    <section className={className} style={{ viewTransitionName: 'surface-intro' }}>
      <Heading className={headingClassName}>{heading}</Heading>
      <p className={ledeClassName}>{lede}</p>
    </section>
  )
}
